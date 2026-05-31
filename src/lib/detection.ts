import { getDb } from './db'
import { EXCLUDED_CATEGORIES } from './utils'

const CATEGORY_FILTER = `AND NOT EXISTS (
  SELECT 1 FROM finale_products fp
  WHERE fp.product_id = cs.product_id
  AND fp.category IN (${EXCLUDED_CATEGORIES.map(c => `'${c}'`).join(',')})
)`

export interface DetectionResult {
  rule: string
  created: number
  skipped: number
}

export interface DetectionSummary {
  rules: DetectionResult[]
  totalCreated: number
  totalSkipped: number
  timestamp: string
}

export function runAllDetectionRules(): DetectionSummary {
  const rules: DetectionResult[] = []

  rules.push(detectNegativeStock())
  rules.push(detectGhostStock())
  rules.push(detectDuplicateTransfers())

  return {
    rules,
    totalCreated: rules.reduce((s, r) => s + r.created, 0),
    totalSkipped: rules.reduce((s, r) => s + r.skipped, 0),
    timestamp: new Date().toISOString(),
  }
}

// Rule 1: Negative stock — bin has more outbound than inbound transfers
// Surfaces top offenders grouped by facility
function detectNegativeStock(): DetectionResult {
  const db = getDb()
  let created = 0
  let skipped = 0

  // Get top negative stock entries by magnitude, limited to avoid flood
  const rows = db.prepare(`
    SELECT cs.product_id, cs.product_name, cs.facility_url, cs.facility_name, cs.net_qty
    FROM computed_stock cs
    WHERE cs.net_qty < -10
    ${CATEGORY_FILTER}
    ORDER BY cs.net_qty ASC
    LIMIT 50
  `).all() as {
    product_id: string; product_name: string
    facility_url: string; facility_name: string; net_qty: number
  }[]

  for (const row of rows) {
    const existing = db.prepare(`
      SELECT id FROM discrepancies
      WHERE sku = ? AND bin_location = ? AND discrepancy_type = 'bin_count_off'
        AND source = 'Auto-Detection' AND status != 'resolved'
    `).get(row.product_id, row.facility_name)

    if (existing) { skipped++; continue }

    const absQty = Math.abs(row.net_qty)
    const priority = absQty > 10000 ? 'critical' : absQty > 1000 ? 'high' : absQty > 100 ? 'medium' : 'low'

    const result = db.prepare(`
      INSERT INTO discrepancies
        (order_number, sku, bin_location, expected_qty, shipped_qty,
         discrepancy_type, status, priority, source)
      VALUES ('AUTO-NEG', ?, ?, 0, ?, 'bin_count_off', 'open', ?, 'Auto-Detection')
    `).run(row.product_id, row.facility_name, Math.round(absQty), priority)

    db.prepare(`
      INSERT INTO audit_log (discrepancy_id, actor_name, action, to_value)
      VALUES (?, 'System', 'created', 'Negative stock detected')
    `).run(result.lastInsertRowid)

    db.prepare(`
      INSERT INTO notes (discrepancy_id, author_name, body)
      VALUES (?, 'System', ?)
    `).run(result.lastInsertRowid,
      `Auto-detected: Negative stock at bin.\n` +
      `Product: ${row.product_name} (${row.product_id})\n` +
      `Bin: ${row.facility_name}\n` +
      `Computed net quantity: ${Math.round(row.net_qty)}\n` +
      `This means more units were transferred OUT of this bin than were ever transferred IN.\n\n` +
      `Possible causes:\n` +
      `- Transfers logged to wrong bin\n` +
      `- Receiving not recorded\n` +
      `- Inventory adjustment needed in Finale`
    )

    created++
  }

  return { rule: 'Negative Stock', created, skipped }
}

// Rule 2: Ghost stock — product shows positive qty at a deactivated facility
function detectGhostStock(): DetectionResult {
  const db = getDb()
  let created = 0
  let skipped = 0

  const rows = db.prepare(`
    SELECT cs.product_id, cs.product_name, cs.facility_url, cs.facility_name,
           cs.net_qty, f.status AS facility_status
    FROM computed_stock cs
    JOIN finale_facilities f ON f.facility_url = cs.facility_url
    WHERE f.status = 'FACILITY_INACTIVE' AND cs.net_qty > 10
    ${CATEGORY_FILTER}
    ORDER BY cs.net_qty DESC
    LIMIT 50
  `).all() as {
    product_id: string; product_name: string
    facility_url: string; facility_name: string
    net_qty: number; facility_status: string
  }[]

  for (const row of rows) {
    const existing = db.prepare(`
      SELECT id FROM discrepancies
      WHERE sku = ? AND bin_location = ? AND discrepancy_type = 'scan_mismatch'
        AND source = 'Auto-Detection' AND status != 'resolved'
    `).get(row.product_id, row.facility_name)

    if (existing) { skipped++; continue }

    const priority = row.net_qty > 5000 ? 'high' : row.net_qty > 500 ? 'medium' : 'low'

    const result = db.prepare(`
      INSERT INTO discrepancies
        (order_number, sku, bin_location, expected_qty, shipped_qty,
         discrepancy_type, status, priority, source)
      VALUES ('AUTO-GHOST', ?, ?, 0, ?, 'scan_mismatch', 'open', ?, 'Auto-Detection')
    `).run(row.product_id, row.facility_name, Math.round(row.net_qty), priority)

    db.prepare(`
      INSERT INTO audit_log (discrepancy_id, actor_name, action, to_value)
      VALUES (?, 'System', 'created', 'Ghost stock detected')
    `).run(result.lastInsertRowid)

    db.prepare(`
      INSERT INTO notes (discrepancy_id, author_name, body)
      VALUES (?, 'System', ?)
    `).run(result.lastInsertRowid,
      `Auto-detected: Stock at deactivated bin.\n` +
      `Product: ${row.product_name} (${row.product_id})\n` +
      `Bin: ${row.facility_name} (STATUS: ${row.facility_status})\n` +
      `Phantom quantity: ${Math.round(row.net_qty)} units\n\n` +
      `This bin is marked inactive in Finale but still shows positive stock from transfer history.\n\n` +
      `Action needed:\n` +
      `- Verify if product was physically moved\n` +
      `- Transfer stock to the correct active bin in Finale\n` +
      `- Or adjust inventory if product is no longer there`
    )

    created++
  }

  return { rule: 'Ghost Stock', created, skipped }
}

// Rule 3: Duplicate transfers — same product, qty, from, to, date appearing multiple times
function detectDuplicateTransfers(): DetectionResult {
  const db = getDb()
  let created = 0
  let skipped = 0

  const rows = db.prepare(`
    SELECT t.product_id, t.quantity, t.facility_from, t.facility_to, t.send_date, COUNT(*) AS cnt
    FROM finale_transfers t
    WHERE t.quantity > 0
    AND NOT EXISTS (
      SELECT 1 FROM finale_products fp
      WHERE fp.product_id = t.product_id
      AND fp.category IN (${EXCLUDED_CATEGORIES.map(c => `'${c}'`).join(',')})
    )
    GROUP BY t.product_id, t.quantity, t.facility_from, t.facility_to, t.send_date
    HAVING cnt > 2
    ORDER BY (t.quantity * cnt) DESC
    LIMIT 30
  `).all() as {
    product_id: string; quantity: number
    facility_from: string; facility_to: string
    send_date: string; cnt: number
  }[]

  for (const row of rows) {
    // Get facility names for display
    const fromFac = db.prepare(`SELECT facility_name FROM finale_facilities WHERE facility_url = ?`).get(row.facility_from) as { facility_name: string } | undefined
    const toFac = db.prepare(`SELECT facility_name FROM finale_facilities WHERE facility_url = ?`).get(row.facility_to) as { facility_name: string } | undefined
    const toName = toFac?.facility_name || row.facility_to

    const existing = db.prepare(`
      SELECT id FROM discrepancies
      WHERE sku = ? AND bin_location = ? AND discrepancy_type = 'duplicate_scan'
        AND source = 'Auto-Detection' AND status != 'resolved'
    `).get(row.product_id, toName)

    if (existing) { skipped++; continue }

    const totalExcess = row.quantity * (row.cnt - 1)
    const priority = totalExcess > 5000 ? 'critical' : totalExcess > 500 ? 'high' : 'medium'

    const result = db.prepare(`
      INSERT INTO discrepancies
        (order_number, sku, bin_location, expected_qty, shipped_qty,
         discrepancy_type, status, priority, source)
      VALUES ('AUTO-DUPE', ?, ?, ?, ?, 'duplicate_scan', 'open', ?, 'Auto-Detection')
    `).run(row.product_id, toName, Math.round(row.quantity), Math.round(row.quantity * row.cnt), priority)

    db.prepare(`
      INSERT INTO audit_log (discrepancy_id, actor_name, action, to_value)
      VALUES (?, 'System', 'created', 'Duplicate transfer detected')
    `).run(result.lastInsertRowid)

    db.prepare(`
      INSERT INTO notes (discrepancy_id, author_name, body)
      VALUES (?, 'System', ?)
    `).run(result.lastInsertRowid,
      `Auto-detected: Duplicate transfer entries.\n` +
      `Product: ${row.product_id}\n` +
      `Transfer: ${fromFac?.facility_name || row.facility_from} → ${toName}\n` +
      `Quantity per transfer: ${row.quantity}\n` +
      `Occurrences: ${row.cnt}x (expected 1x)\n` +
      `Excess quantity impact: ${Math.round(totalExcess)} units\n` +
      `Date: ${row.send_date}\n\n` +
      `This exact transfer was recorded ${row.cnt} times. If only 1 was intentional, ` +
      `the extra ${row.cnt - 1} entries are inflating stock at "${toName}" ` +
      `and deflating stock at "${fromFac?.facility_name || row.facility_from}".`
    )

    created++
  }

  return { rule: 'Duplicate Transfers', created, skipped }
}
