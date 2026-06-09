import { getDb } from './db'
import type { SheetRow } from './sheets'

export interface ComparisonLine {
  productId: string
  productName: string | null
  binLocation: string
  finaleQty: number
  physicalCount: number
  variance: number
  variancePct: number
  status: 'match' | 'variance' | 'not_in_finale' | 'not_counted'
}

export interface ComparisonResult {
  lines: ComparisonLine[]
  summary: {
    totalLines: number
    matched: number
    variances: number
    notInFinale: number
    notCounted: number
    totalVarianceUnits: number
  }
  importedAt: string
}

export function compareWithFinale(sheetRows: SheetRow[]): ComparisonResult {
  const db = getDb()
  const lines: ComparisonLine[] = []

  const productIds = [...new Set(sheetRows.map(r => r.productId))]
  const binLocations = [...new Set(sheetRows.map(r => r.binLocation).filter(Boolean))]

  // Bulk-load stock from finale_stock_csv (CSV-imported), fall back to computed_stock (API-synced)
  const stockMap = new Map<string, { net_qty: number; product_name: string }>()

  // Try finale_stock_csv first (populated by CSV upload — no bin join, product-level only)
  let useCsvStock = false
  try {
    const csvCount = (db.prepare(`SELECT COUNT(*) as c FROM finale_stock_csv`).get() as { c: number } | undefined)?.c ?? 0
    useCsvStock = csvCount > 0
  } catch { /* table may not exist yet */ }

  if (useCsvStock) {
    // finale_stock_csv has per-bin rows when bin_location is set, or product-level when empty
    const rows = db.prepare(`SELECT product_id, bin_location, product_name, qoh FROM finale_stock_csv`).all() as
      { product_id: string; bin_location: string; product_name: string; qoh: number }[]
    for (const r of rows) {
      // Store under both the specific bin key and a wildcard key (empty bin) for fallback matching
      const key = `${r.product_id}::${r.bin_location}`
      const existing = stockMap.get(key)
      stockMap.set(key, { net_qty: (existing?.net_qty ?? 0) + r.qoh, product_name: r.product_name || r.product_id })
    }
  } else if (binLocations.length > 0) {
    const binPlaceholders = binLocations.map(() => '?').join(',')
    const stockRows = db.prepare(`
      SELECT cs.product_id, cs.facility_name, cs.net_qty, cs.product_name
      FROM computed_stock cs
      WHERE cs.facility_name IN (${binPlaceholders})
    `).all(...binLocations) as { product_id: string; facility_name: string; net_qty: number; product_name: string }[]
    for (const r of stockRows) stockMap.set(`${r.product_id}::${r.facility_name}`, { net_qty: r.net_qty, product_name: r.product_name })
  }

  // Bulk-load product names
  const nameMap = new Map<string, string>()
  if (productIds.length > 0) {
    const idPlaceholders = productIds.map(() => '?').join(',')
    const prodRows = db.prepare(`SELECT product_id, internal_name FROM finale_products WHERE product_id IN (${idPlaceholders})`).all(...productIds) as { product_id: string; internal_name: string }[]
    for (const r of prodRows) nameMap.set(r.product_id, r.internal_name)
  }

  // Build a set of product+bin combos from the sheet
  const counted = new Set<string>()

  for (const row of sheetRows) {
    const key = `${row.productId}::${row.binLocation}`
    counted.add(key)

    // Try exact bin match first, then product-level (empty bin) as fallback
    const stock = stockMap.get(key) ?? stockMap.get(`${row.productId}::`)
    const finaleQty = stock ? Math.round(stock.net_qty) : 0
    const productName = stock?.product_name || nameMap.get(row.productId) || null

    const variance = row.physicalCount - finaleQty
    const variancePct = finaleQty !== 0 ? (variance / Math.abs(finaleQty)) * 100 : (row.physicalCount > 0 ? 100 : 0)

    let status: ComparisonLine['status'] = 'match'
    if (finaleQty === 0 && row.physicalCount > 0) status = 'not_in_finale'
    else if (variance !== 0) status = 'variance'

    lines.push({
      productId: row.productId,
      productName,
      binLocation: row.binLocation,
      finaleQty,
      physicalCount: row.physicalCount,
      variance,
      variancePct: Math.round(variancePct * 10) / 10,
      status,
    })
  }

  // Find items in Finale stock at counted bins that weren't on the sheet
  for (const [key, stock] of stockMap) {
    if (stock.net_qty <= 0) continue
    const [productId, bin] = key.split('::')
    if (!counted.has(key)) {
      lines.push({
        productId,
        productName: stock.product_name,
        binLocation: bin,
        finaleQty: Math.round(stock.net_qty),
        physicalCount: 0,
        variance: -Math.round(stock.net_qty),
        variancePct: -100,
        status: 'not_counted',
      })
    }
  }

  // Sort: variances first, then not_counted, then not_in_finale, then matches
  const order = { variance: 0, not_counted: 1, not_in_finale: 2, match: 3 }
  lines.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.variance) - Math.abs(a.variance))

  const matched = lines.filter(l => l.status === 'match').length
  const variances = lines.filter(l => l.status === 'variance').length
  const notInFinale = lines.filter(l => l.status === 'not_in_finale').length
  const notCounted = lines.filter(l => l.status === 'not_counted').length
  const totalVarianceUnits = lines.reduce((s, l) => s + Math.abs(l.variance), 0)

  return {
    lines,
    summary: { totalLines: lines.length, matched, variances, notInFinale, notCounted, totalVarianceUnits },
    importedAt: new Date().toISOString(),
  }
}

export function saveComparison(result: ComparisonResult, sheetId: string, sheetName: string, countedBy: string) {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS sheet_comparisons (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_id      TEXT NOT NULL,
      sheet_name    TEXT,
      counted_by    TEXT NOT NULL,
      total_lines   INTEGER,
      matched       INTEGER,
      variances     INTEGER,
      not_in_finale INTEGER,
      not_counted   INTEGER,
      variance_units INTEGER,
      imported_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sheet_comparison_lines (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      comparison_id   INTEGER NOT NULL REFERENCES sheet_comparisons(id),
      product_id      TEXT NOT NULL,
      product_name    TEXT,
      bin_location    TEXT,
      finale_qty      REAL,
      physical_count  REAL,
      variance        REAL,
      variance_pct    REAL,
      status          TEXT NOT NULL
    );
  `)

  const ins = db.prepare(`
    INSERT INTO sheet_comparisons
      (sheet_id, sheet_name, counted_by, total_lines, matched, variances, not_in_finale, not_counted, variance_units)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const r = ins.run(
    sheetId, sheetName, countedBy,
    result.summary.totalLines, result.summary.matched,
    result.summary.variances, result.summary.notInFinale,
    result.summary.notCounted, result.summary.totalVarianceUnits
  )
  const compId = r.lastInsertRowid

  const insLine = db.prepare(`
    INSERT INTO sheet_comparison_lines
      (comparison_id, product_id, product_name, bin_location, finale_qty, physical_count, variance, variance_pct, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const l of result.lines) {
    insLine.run(compId, l.productId, l.productName, l.binLocation, l.finaleQty, l.physicalCount, l.variance, l.variancePct, l.status)
  }

  // Auto-create discrepancies for variances
  for (const l of result.lines) {
    if (l.status !== 'variance' && l.status !== 'not_counted') continue
    if (Math.abs(l.variance) < 1) continue

    const existing = db.prepare(`
      SELECT id FROM discrepancies
      WHERE sku = ? AND bin_location = ? AND status != 'resolved' AND source = 'Sheet Comparison'
    `).get(l.productId, l.binLocation)
    if (existing) continue

    const priority = Math.abs(l.variance) > 100 ? 'critical' : Math.abs(l.variance) > 20 ? 'high' : Math.abs(l.variance) > 5 ? 'medium' : 'low'
    const discType = l.variance < 0 ? 'short_shipped' : 'over_shipped'

    const discResult = db.prepare(`
      INSERT INTO discrepancies
        (order_number, sku, bin_location, expected_qty, shipped_qty,
         discrepancy_type, status, priority, source)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'Sheet Comparison')
    `).run(`SHEET-${compId}`, l.productId, l.binLocation, l.finaleQty, l.physicalCount, discType, priority)

    db.prepare(`
      INSERT INTO notes (discrepancy_id, author_name, body)
      VALUES (?, ?, ?)
    `).run(discResult.lastInsertRowid, countedBy,
      `Sheet comparison: ${l.productName || l.productId}\n` +
      `Bin: ${l.binLocation}\n` +
      `Finale says: ${l.finaleQty}\n` +
      `Physical count: ${l.physicalCount}\n` +
      `Variance: ${l.variance > 0 ? '+' : ''}${l.variance} (${l.variancePct}%)\n` +
      (l.status === 'not_counted' ? 'Product exists in Finale but was not on the count sheet.' : '')
    )
  }

  return compId
}
