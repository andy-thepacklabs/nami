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

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const finaleFile = formData.get('finaleFile') as File | null
  const physicalFile = formData.get('physicalFile') as File | null
  const countedBy = (formData.get('countedBy') as string) || 'CSV Compare'

  if (!finaleFile || !physicalFile) {
    return NextResponse.json({ error: 'Both files are required' }, { status: 400 })
  }

  // Parse Finale CSV — needs Product ID and QoH
  const { headers: fh, rows: fr } = parseCSV(await finaleFile.text())
  const fPidCol = findCol(fh, 'product id', 'product_id', 'productid', 'sku', 'item')
  const fQohCol = findCol(fh, 'qoh', 'qty on hand', 'qty_on_hand', 'quantity on hand', 'on hand', 'onhand')
  const fBinCol = findCol(fh, 'bin', 'location', 'sublocation', 'sub-location')
  const fNameCol = findCol(fh, 'description', 'name', 'product name')

  if (fPidCol === -1) return NextResponse.json({ error: `Finale CSV missing Product ID column. Found: [${fh.join(', ')}]` }, { status: 400 })
  if (fQohCol === -1) return NextResponse.json({ error: `Finale CSV missing QoH column. Found: [${fh.join(', ')}]. Need a column with "qoh", "qty on hand", or "on hand".` }, { status: 400 })

  // Parse physical count CSV — needs Product ID and count
  const { headers: ph, rows: pr } = parseCSV(await physicalFile.text())
  const pPidCol = findCol(ph, 'product id', 'product_id', 'productid', 'sku', 'item')
  const pCountCol = findCol(ph, 'count', 'qty', 'quantity', 'physical', 'actual')
  const pBinCol = findCol(ph, 'bin', 'location', 'rack')

  if (pPidCol === -1) return NextResponse.json({ error: `Physical count CSV missing Product ID column. Found: [${ph.join(', ')}]` }, { status: 400 })
  if (pCountCol === -1) return NextResponse.json({ error: `Physical count CSV missing count column. Found: [${ph.join(', ')}]. Need a column with "count", "qty", or "quantity".` }, { status: 400 })

  // Build Finale map: productId+bin -> { qoh, name }
  // Finale export may have sub-rows per bin location — aggregate QoH per product+bin
  const finaleMap = new Map<string, { qoh: number; name: string }>()
  for (const row of fr) {
    const pid = row[fPidCol]?.trim()
    if (!pid) continue
    const bin = fBinCol >= 0 ? (row[fBinCol]?.trim() || '') : ''
    const qohRaw = row[fQohCol]?.replace(/,/g, '').trim()
    const qoh = parseFloat(qohRaw)
    if (!pid || isNaN(qoh)) continue
    const key = `${pid}::${bin}`
    const existing = finaleMap.get(key)
    if (existing) {
      existing.qoh += qoh
    } else {
      finaleMap.set(key, { qoh, name: fNameCol >= 0 ? (row[fNameCol] || pid) : pid })
    }
  }

  // Build physical map: productId+bin -> count
  const physicalMap = new Map<string, number>()
  for (const row of pr) {
    const pid = row[pPidCol]?.trim()
    if (!pid) continue
    const bin = pBinCol >= 0 ? (row[pBinCol]?.trim() || '') : ''
    const countRaw = row[pCountCol]?.replace(/,/g, '').trim()
    const count = parseFloat(countRaw)
    if (!pid || isNaN(count)) continue
    const key = `${pid}::${bin}`
    physicalMap.set(key, (physicalMap.get(key) || 0) + count)
  }

  // Build comparison lines
  type Status = 'match' | 'variance' | 'not_in_finale' | 'not_counted'
  interface Line {
    productId: string; productName: string; binLocation: string
    finaleQty: number; physicalCount: number; variance: number; variancePct: number; status: Status
  }
  const lines: Line[] = []
  const seen = new Set<string>()

  // Items in physical count
  for (const [key, physCount] of physicalMap) {
    seen.add(key)
    const [pid, bin] = key.split('::')
    const finale = finaleMap.get(key)
    const finaleQty = finale ? Math.round(finale.qoh) : 0
    const productName = finale?.name || pid
    const variance = physCount - finaleQty
    const variancePct = finaleQty !== 0 ? Math.round((variance / Math.abs(finaleQty)) * 1000) / 10 : (physCount > 0 ? 100 : 0)
    let status: Status = 'match'
    if (finaleQty === 0 && physCount > 0) status = 'not_in_finale'
    else if (variance !== 0) status = 'variance'
    lines.push({ productId: pid, productName, binLocation: bin, finaleQty, physicalCount: physCount, variance, variancePct, status })
  }

  // Items in Finale not counted
  for (const [key, { qoh, name }] of finaleMap) {
    if (seen.has(key) || qoh <= 0) continue
    const [pid, bin] = key.split('::')
    lines.push({ productId: pid, productName: name, binLocation: bin, finaleQty: Math.round(qoh), physicalCount: 0, variance: -Math.round(qoh), variancePct: -100, status: 'not_counted' })
  }

  const order = { variance: 0, not_counted: 1, not_in_finale: 2, match: 3 }
  lines.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.variance) - Math.abs(a.variance))

  const matched = lines.filter(l => l.status === 'match').length
  const variances = lines.filter(l => l.status === 'variance').length
  const notInFinale = lines.filter(l => l.status === 'not_in_finale').length
  const notCounted = lines.filter(l => l.status === 'not_counted').length
  const totalVarianceUnits = lines.reduce((s, l) => s + Math.abs(l.variance), 0)

  // Save to DB
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS sheet_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sheet_id TEXT NOT NULL, sheet_name TEXT,
      counted_by TEXT NOT NULL, total_lines INTEGER, matched INTEGER, variances INTEGER,
      not_in_finale INTEGER, not_counted INTEGER, variance_units INTEGER,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sheet_comparison_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, comparison_id INTEGER NOT NULL,
      product_id TEXT NOT NULL, product_name TEXT, bin_location TEXT,
      finale_qty REAL, physical_count REAL, variance REAL, variance_pct REAL, status TEXT NOT NULL
    );
  `)
  const comp = db.prepare(`
    INSERT INTO sheet_comparisons (sheet_id, sheet_name, counted_by, total_lines, matched, variances, not_in_finale, not_counted, variance_units)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(finaleFile.name, physicalFile.name, countedBy, lines.length, matched, variances, notInFinale, notCounted, totalVarianceUnits)
  const compId = comp.lastInsertRowid
  const insLine = db.prepare(`
    INSERT INTO sheet_comparison_lines (comparison_id, product_id, product_name, bin_location, finale_qty, physical_count, variance, variance_pct, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const l of lines) insLine.run(compId, l.productId, l.productName, l.binLocation, l.finaleQty, l.physicalCount, l.variance, l.variancePct, l.status)

  return NextResponse.json({
    id: compId,
    lines,
    summary: { totalLines: lines.length, matched, variances, notInFinale, notCounted, totalVarianceUnits },
    importedAt: new Date().toISOString(),
  })
}
