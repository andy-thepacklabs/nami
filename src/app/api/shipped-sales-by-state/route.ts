import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const db = getDb()

    // shipped_sales_by_product stores "Ship to state / region" in a column
    // Check which column holds state data
    const meta = db.prepare(`
      SELECT MAX(imported_at) as last_import, COUNT(*) as total
      FROM shipped_sales_by_product
    `).get() as { last_import: string | null; total: number }

    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    if (mode === 'bymonth') {
      const agg = db.prepare(`
        SELECT
          substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) AS month_key,
          COALESCE(NULLIF(ship_to_state,''), 'Unknown')    AS state,
          COUNT(DISTINCT order_id)                          AS orders,
          SUM(qty_shipped)                                  AS qty,
          SUM(amount)                                       AS revenue
        FROM shipped_sales_by_product
        WHERE month_key != ''
        GROUP BY month_key, state
        ORDER BY month_key DESC, revenue DESC
      `).all()
      return NextResponse.json({ agg, meta })
    }

    // thismonth
    const now = new Date()
    const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const agg = db.prepare(`
      SELECT
        COALESCE(NULLIF(ship_to_state,''), 'Unknown') AS state,
        COUNT(DISTINCT order_id)                AS orders,
        SUM(qty_shipped)                        AS qty,
        SUM(amount)                             AS revenue
      FROM shipped_sales_by_product
      WHERE substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) = ?
      GROUP BY state
      ORDER BY revenue DESC
    `).all(ym)
    return NextResponse.json({ agg, meta })
  } catch (err) {
    return NextResponse.json({ agg: [], error: String(err) }, { status: 500 })
  }
}
