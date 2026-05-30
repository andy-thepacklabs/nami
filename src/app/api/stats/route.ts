import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END)                                    AS total_open,
      SUM(CASE WHEN priority = 'critical' AND status != 'resolved' THEN 1 ELSE 0 END)          AS total_critical,
      SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END)                                    AS total_escalated,
      SUM(CASE WHEN status = 'resolved' AND date(resolved_at) = date('now') THEN 1 ELSE 0 END) AS resolved_today,
      COUNT(*)                                                                                   AS total_all
    FROM discrepancies
  `).get() as Record<string, number>

  const byType = db.prepare(`
    SELECT discrepancy_type AS type, COUNT(*) AS count
    FROM discrepancies WHERE status != 'resolved'
    GROUP BY discrepancy_type ORDER BY count DESC
  `).all() as { type: string; count: number }[]

  const recentActivity = db.prepare(`
    SELECT d.id, d.order_number, d.sku, d.discrepancy_type, d.status, d.priority,
           d.bin_location, d.created_at
    FROM discrepancies d
    ORDER BY d.created_at DESC LIMIT 5
  `).all()

  const hotBins = db.prepare(`
    SELECT bin_location AS bin, COUNT(*) AS count,
           SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) AS critical_count
    FROM discrepancies
    WHERE status != 'resolved'
    GROUP BY bin_location
    ORDER BY count DESC
    LIMIT 15
  `).all() as { bin: string; count: number; critical_count: number }[]

  return NextResponse.json({ stats, byType, recentActivity, hotBins })
}
