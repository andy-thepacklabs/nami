import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    result.push(cur.trim())
    return result
  }
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(l => parseLine(l).map(c => c.replace(/^"|"$/g, '').trim()))
  return { headers, rows }
}

function findCol(headers: string[], ...keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.includes(k)))
}

function ensureTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_stock_csv (
      product_id   TEXT NOT NULL,
      bin_location TEXT NOT NULL DEFAULT '',
      product_name TEXT,
      qoh          REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, bin_location)
    )
  `)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Reject Excel/ZIP files early — XLSX files are ZIP archives (magic bytes PK\x03\x04)
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
  if (isXlsx) {
    return NextResponse.json({
      error: 'Excel files (.xlsx/.xls) are not supported. In Finale, export as CSV: Actions → Export → CSV format.'
    }, { status: 400 })
  }
  const rawBytes = await file.arrayBuffer()
  const magic = new Uint8Array(rawBytes.slice(0, 4))
  if (magic[0] === 0x50 && magic[1] === 0x4B) {
    return NextResponse.json({
      error: 'This file appears to be an Excel/ZIP file, not a CSV. In Finale, export as CSV: Actions → Export → CSV format.'
    }, { status: 400 })
  }

  const text = new TextDecoder().decode(rawBytes)
  const { headers, rows } = parseCSV(text)

  const pidCol  = findCol(headers, 'product id', 'product_id', 'productid', 'sku', 'item')
  const qohCol  = findCol(headers, 'stock: qoh', 'qoh', 'qty on hand', 'qty_on_hand', 'on hand', 'onhand')
  const nameCol = findCol(headers, 'description', 'name', 'product name', 'internal name')
  const binCol  = findCol(headers, 'sublocation', 'sub-location', 'bin location', 'bin', 'location')

  if (pidCol === -1) return NextResponse.json({ error: `Missing Product ID column. Found: [${headers.join(', ')}]` }, { status: 400 })
  if (qohCol === -1) return NextResponse.json({ error: `Missing Stock: QoH column. Found: [${headers.join(', ')}]` }, { status: 400 })

  const db = getDb()
  ensureTable(db)
  db.exec(`DELETE FROM finale_stock_csv`)

  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, qoh, imported_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)

  let imported = 0
  let lastPid = ''
  let lastName = ''

  db.transaction(() => {
    for (const row of rows) {
      const rawPid = row[pidCol]?.trim()

      if (rawPid) {
        // Parent row — store product name, skip QoH (sub-rows have per-bin QoH)
        lastPid = rawPid
        lastName = nameCol >= 0 ? (row[nameCol]?.trim() || rawPid) : rawPid

        // If no bin column, store the product-level total directly
        if (binCol === -1) {
          const qoh = parseFloat(row[qohCol]?.replace(/,/g, '').trim())
          if (!isNaN(qoh) && qoh > 0) { ins.run(lastPid, '', lastName, qoh); imported++ }
        }
        continue
      }

      // Sub-row — belongs to lastPid
      if (!lastPid) continue
      const bin = binCol >= 0 ? (row[binCol]?.trim() || '') : ''
      const qoh = parseFloat(row[qohCol]?.replace(/,/g, '').trim())
      if (isNaN(qoh) || qoh <= 0) continue

      ins.run(lastPid, bin, lastName, qoh)
      imported++
    }
  })()

  const importedAt = (db.prepare(`SELECT imported_at FROM finale_stock_csv LIMIT 1`).get() as { imported_at: string } | undefined)?.imported_at
  return NextResponse.json({ imported, syncedAt: importedAt })
}

export async function GET() {
  const db = getDb()
  try {
    ensureTable(db)
    const count = (db.prepare(`SELECT COUNT(DISTINCT product_id) as c FROM finale_stock_csv`).get() as { c: number }).c
    const row = db.prepare(`SELECT imported_at FROM finale_stock_csv ORDER BY imported_at DESC LIMIT 1`).get() as { imported_at: string } | undefined
    return NextResponse.json({ count, syncedAt: row?.imported_at ?? null })
  } catch {
    return NextResponse.json({ count: 0, syncedAt: null })
  }
}
