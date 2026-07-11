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

function num(val: string | undefined): number | null {
  if (!val) return null
  const n = parseFloat(val.replace(/,/g, '').trim())
  return isNaN(n) ? null : n
}

function ensureTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_sales_csv (
      product_id        TEXT PRIMARY KEY,
      product_name      TEXT,
      category          TEXT,
      sales_7d          REAL,
      sales_30d         REAL,
      sales_60d         REAL,
      sales_90d         REAL,
      sales_180d        REAL,
      sales_last_month  REAL,
      sales_this_month  REAL,
      qty_on_hand       REAL,
      qty_available     REAL,
      average_cost      REAL,
      upc               TEXT,
      imported_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
  if (isXlsx) {
    return NextResponse.json({
      error: 'Excel files (.xlsx/.xls) are not supported. Export as CSV from Finale.'
    }, { status: 400 })
  }
  const rawBytes = await file.arrayBuffer()
  const magic = new Uint8Array(rawBytes.slice(0, 4))
  if (magic[0] === 0x50 && magic[1] === 0x4B) {
    return NextResponse.json({
      error: 'This file appears to be an Excel/ZIP file, not a CSV.'
    }, { status: 400 })
  }

  const text = new TextDecoder().decode(rawBytes)
  const { headers, rows } = parseCSV(text)

  const pidCol         = findCol(headers, 'product id', 'product_id', 'productid', 'sku', 'item number', 'item')
  const nameCol        = findCol(headers, 'description', 'product name', 'name', 'internal name')
  const catCol         = findCol(headers, 'category', 'product category', 'cat')
  const s7Col          = findCol(headers, 'sales last 7', 'last 7')
  const s30Col         = findCol(headers, 'sales last 30', 'last 30')
  const s60Col         = findCol(headers, 'sales last 60', 'last 60')
  const s90Col         = findCol(headers, 'sales last 90', 'last 90')
  const s180Col        = findCol(headers, 'sales last 180', 'last 180')
  const sLastMonthCol  = findCol(headers, 'sales last month', 'last month')
  const sThisMonthCol  = findCol(headers, 'sales this month', 'this month')
  const qohCol         = findCol(headers, 'qty on hand', 'quantity on hand', 'on hand', 'qoh', 'stock: qoh')
  const availCol       = findCol(headers, 'qty available', 'available', 'qty avail')
  const costCol        = findCol(headers, 'average cost', 'avg cost', 'cost')
  const upcCol         = findCol(headers, 'upc', 'barcode')

  if (pidCol === -1) return NextResponse.json({ error: `Missing Product ID column. Found: [${headers.join(', ')}]` }, { status: 400 })

  const db = getDb()
  ensureTable(db)
  db.exec(`DELETE FROM finale_sales_csv`)

  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_sales_csv
      (product_id, product_name, category, sales_7d, sales_30d, sales_60d, sales_90d,
       sales_180d, sales_last_month, sales_this_month, qty_on_hand, qty_available,
       average_cost, upc, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)

  let imported = 0
  db.transaction(() => {
    for (const row of rows) {
      const pid = row[pidCol]?.trim()
      if (!pid) continue
      ins.run(
        pid,
        nameCol >= 0 ? (row[nameCol]?.trim() || null) : null,
        catCol  >= 0 ? (row[catCol]?.trim()  || null) : null,
        s7Col         >= 0 ? num(row[s7Col])         : null,
        s30Col        >= 0 ? num(row[s30Col])        : null,
        s60Col        >= 0 ? num(row[s60Col])        : null,
        s90Col        >= 0 ? num(row[s90Col])        : null,
        s180Col       >= 0 ? num(row[s180Col])       : null,
        sLastMonthCol >= 0 ? num(row[sLastMonthCol]) : null,
        sThisMonthCol >= 0 ? num(row[sThisMonthCol]) : null,
        qohCol        >= 0 ? num(row[qohCol])        : null,
        availCol      >= 0 ? num(row[availCol])      : null,
        costCol       >= 0 ? num(row[costCol])       : null,
        upcCol        >= 0 ? (row[upcCol]?.trim() || null) : null,
      )
      imported++
    }
  })()

  return NextResponse.json({ imported, syncedAt: new Date().toISOString() })
}

export async function GET() {
  const db = getDb()
  try {
    ensureTable(db)
    const count = (db.prepare(`SELECT COUNT(*) as c FROM finale_sales_csv`).get() as { c: number }).c
    const row = db.prepare(`SELECT imported_at FROM finale_sales_csv ORDER BY imported_at DESC LIMIT 1`).get() as { imported_at: string } | undefined
    return NextResponse.json({ count, syncedAt: row?.imported_at ?? null })
  } catch {
    return NextResponse.json({ count: 0, syncedAt: null })
  }
}
