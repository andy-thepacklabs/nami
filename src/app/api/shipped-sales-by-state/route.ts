import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const db = getDb()

    const meta = db.prepare(`
      SELECT MAX(imported_at) as last_import, COUNT(*) as total
      FROM shipped_sales_by_product
    `).get() as { last_import: string | null; total: number }

    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    if (mode === 'today') {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const agg = db.prepare(`
        SELECT
          COALESCE(NULLIF(ship_to_state,''), 'Unknown') AS state,
          COUNT(DISTINCT order_id)                       AS orders,
          SUM(qty_shipped)                               AS qty,
          SUM(amount)                                    AS revenue
        FROM shipped_sales_by_product
        WHERE ship_date = ?
        GROUP BY state
        ORDER BY revenue DESC
      `).all(today)

      const products = db.prepare(`
        SELECT
          COALESCE(NULLIF(ship_to_state,''), 'Unknown')          AS state,
          product_id,
          COALESCE(NULLIF(product_name,''), product_id, '—')     AS product,
          SUM(qty_shipped)                                        AS qty,
          SUM(amount)                                             AS revenue
        FROM shipped_sales_by_product
        WHERE ship_date = ?
        GROUP BY state, product_id
        ORDER BY state, revenue DESC
      `).all(today)

      return NextResponse.json({ agg, products, meta })
    }

    if (mode === 'bymonth') {
      // State summary per month
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

      // Product breakdown per month+state
      const products = db.prepare(`
        SELECT
          substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7)          AS month_key,
          COALESCE(NULLIF(ship_to_state,''), 'Unknown')             AS state,
          product_id,
          COALESCE(NULLIF(product_name,''), product_id, '—')        AS product,
          SUM(qty_shipped)                                           AS qty,
          SUM(amount)                                                AS revenue
        FROM shipped_sales_by_product
        WHERE month_key != ''
        GROUP BY month_key, state, product_id
        ORDER BY month_key DESC, state, revenue DESC
      `).all()

      return NextResponse.json({ agg, products, meta })
    }

    // thismonth — state summary
    const now = new Date()
    const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const agg = db.prepare(`
      SELECT
        COALESCE(NULLIF(ship_to_state,''), 'Unknown') AS state,
        COUNT(DISTINCT order_id)                       AS orders,
        SUM(qty_shipped)                               AS qty,
        SUM(amount)                                    AS revenue
      FROM shipped_sales_by_product
      WHERE substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) = ?
      GROUP BY state
      ORDER BY revenue DESC
    `).all(ym)

    // Product breakdown per state for this month
    const products = db.prepare(`
      SELECT
        COALESCE(NULLIF(ship_to_state,''), 'Unknown')          AS state,
        product_id,
        COALESCE(NULLIF(product_name,''), product_id, '—')     AS product,
        SUM(qty_shipped)                                        AS qty,
        SUM(amount)                                             AS revenue
      FROM shipped_sales_by_product
      WHERE substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) = ?
      GROUP BY state, product_id
      ORDER BY state, revenue DESC
    `).all(ym)

    return NextResponse.json({ agg, products, meta })
  } catch (err) {
    return NextResponse.json({ agg: [], products: [], error: String(err) }, { status: 500 })
  }
}
