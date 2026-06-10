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
  const physicalFile = formData.get('physicalFile') as File | null
  const countedBy = (formData.get('countedBy') as string) || 'CSV Compare'

  if (!physicalFile) {
    return NextResponse.json({ error: 'Physical count file is required' }, { status: 400 })
  }

  // Helper: detect Excel/ZIP magic bytes (PK\x03\x04)
  function isZipFile(bytes: Uint8Array) { return bytes[0] === 0x50 && bytes[1] === 0x4B }
  function isExcelName(name: string) { const n = name.toLowerCase(); return n.endsWith('.xlsx') || n.endsWith('.xls') }

  // Check Physical file
  if (isExcelName(physicalFile.name)) {
    return NextResponse.json({ error: 'Physical count file is an Excel file (.xlsx/.xls). Please save/export as CSV.' }, { status: 400 })
  }
  const physBytes = await physicalFile.arrayBuffer()
  if (isZipFile(new Uint8Array(physBytes.slice(0, 4)))) {
    return NextResponse.json({ error: 'Physical count file appears to be an Excel/ZIP file. Please save/export as CSV.' }, { status: 400 })
  }

  // Build Finale map from synced DB data (finale_stock_csv)
  const db = getDb()
  const finaleRows = db.prepare(`SELECT product_id, product_name, SUM(qoh) as total_qoh FROM finale_stock_csv GROUP BY product_id`).all() as { product_id: string; product_name: string | null; total_qoh: number }[]
  if (finaleRows.length === 0) {
    return NextResponse.json({ error: 'No Finale stock data found. Go to the Finale Report tab and click "Sync from Finale" first.' }, { status: 400 })
  }
  const finaleMap = new Map<string, { qoh: number; name: string }>()
  for (const row of finaleRows) {
    finaleMap.set(row.product_id, { qoh: row.total_qoh ?? 0, name: row.product_name || row.product_id })
  }

  // Parse physical count CSV — needs Product ID and count
  const { headers: ph, rows: pr } = parseCSV(new TextDecoder().decode(physBytes))
  const pPidCol = findCol(ph, 'product id', 'product_id', 'productid', 'sku', 'item')
  const pCountCol = findCol(ph, 'count', 'qty', 'quantity', 'physical', 'actual')
  const pBinCol = findCol(ph, 'bin', 'location', 'rack')

  if (pPidCol === -1) return NextResponse.json({ error: `Physical count CSV missing Product ID column. Found: [${ph.join(', ')}]` }, { status: 400 })
  if (pCountCol === -1) return NextResponse.json({ error: `Physical count CSV missing count column. Found: [${ph.join(', ')}]. Need a column with "count", "qty", or "quantity".` }, { status: 400 })

  // Build physical map keyed by productId only (sum across all bins per product)
  // Also track all bin locations per product for display
  const physicalMap = new Map<string, { total: number; bins: string[] }>()
  for (const row of pr) {
    const pid = row[pPidCol]?.trim()
    if (!pid) continue
    const bin = pBinCol >= 0 ? (row[pBinCol]?.trim() || '') : ''
    const countRaw = row[pCountCol]?.replace(/,/g, '').trim()
    const count = parseFloat(countRaw)
    if (isNaN(count)) continue
    const existing = physicalMap.get(pid)
    if (existing) {
      existing.total += count
      if (bin && !existing.bins.includes(bin)) existing.bins.push(bin)
    } else {
      physicalMap.set(pid, { total: count, bins: bin ? [bin] : [] })
    }
  }

  // Build comparison lines — one row per product
  type Status = 'match' | 'variance' | 'not_in_finale' | 'not_counted'
  interface Line {
    productId: string; productName: string; binLocation: string
    finaleQty: number; physicalCount: number; variance: number; variancePct: number; status: Status
  }
  const lines: Line[] = []

  for (const [pid, { total: physCount, bins }] of physicalMap) {
    const finale = finaleMap.get(pid)
    const finaleQty = finale ? Math.round(finale.qoh) : 0
    const productName = finale?.name || pid
    const variance = physCount - finaleQty
    const variancePct = finaleQty !== 0 ? Math.round((variance / Math.abs(finaleQty)) * 1000) / 10 : (physCount > 0 ? 100 : 0)
    let status: Status = 'match'
    if (finaleQty === 0 && physCount > 0) status = 'not_in_finale'
    else if (variance !== 0) status = 'variance'
    lines.push({ productId: pid, productName, binLocation: bins.join(', '), finaleQty, physicalCount: physCount, variance, variancePct, status })
  }

  const order = { variance: 0, not_in_finale: 1, match: 2, not_counted: 3 }
  lines.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.variance) - Math.abs(a.variance))

  const matched = lines.filter(l => l.status === 'match').length
  const variances = lines.filter(l => l.status === 'variance').length
  const notInFinale = lines.filter(l => l.status === 'not_in_finale').length
  const notCounted = lines.filter(l => l.status === 'not_counted').length
  const totalVarianceUnits = lines.reduce((s, l) => s + Math.abs(l.variance), 0)

  // Save to DB
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
  `).run('finale_stock_csv', physicalFile.name, countedBy, lines.length, matched, variances, notInFinale, notCounted, totalVarianceUnits)
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
