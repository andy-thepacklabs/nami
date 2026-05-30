import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()

  const opened_today = (db.prepare(`
    SELECT COUNT(*) AS c FROM discrepancies WHERE date(created_at) = date('now')
  `).get() as { c: number }).c

  const resolved_today = (db.prepare(`
    SELECT COUNT(*) AS c FROM discrepancies WHERE status = 'resolved' AND date(resolved_at) = date('now')
  `).get() as { c: number }).c

  const open_by_priority = db.prepare(`
    SELECT priority, COUNT(*) AS count FROM discrepancies
    WHERE status != 'resolved' GROUP BY priority
  `).all()

  const open_by_type = db.prepare(`
    SELECT discrepancy_type AS type, COUNT(*) AS count FROM discrepancies
    WHERE status != 'resolved' GROUP BY discrepancy_type ORDER BY count DESC
  `).all()

  const top_skus = db.prepare(`
    SELECT sku, COUNT(*) AS count FROM discrepancies
    WHERE status != 'resolved' GROUP BY sku ORDER BY count DESC LIMIT 10
  `).all()

  const top_bins = db.prepare(`
    SELECT bin_location AS bin, COUNT(*) AS count FROM discrepancies
    WHERE status != 'resolved' GROUP BY bin_location ORDER BY count DESC LIMIT 10
  `).all()

  const unresolved_critical = db.prepare(`
    SELECT d.*, u.name AS assigned_name FROM discrepancies d
    LEFT JOIN users u ON u.id = d.assigned_to
    WHERE d.status != 'resolved' AND d.priority = 'critical'
    ORDER BY d.created_at ASC
  `).all()

  return NextResponse.json({
    date: new Date().toISOString().split('T')[0],
    opened_today,
    resolved_today,
    open_by_priority,
    open_by_type,
    top_skus,
    top_bins,
    unresolved_critical,
  })
}
