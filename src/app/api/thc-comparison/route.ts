import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/*
  Classifies shipped_sales_by_product rows by product line:
  - THCP: product_name LIKE '%THCP%'
  - THCA: product_name LIKE '%THCA%' OR '%Liquid Diamond%'
  - Gummies: Functional Euphoria, Functional Microdose, Froot Jam, Cereal Crunchies
*/

const COMPOUND_EXPR = `
  CASE
    WHEN product_name LIKE '%Functional Euphoria%'   THEN 'Functional Euphoria'
    WHEN product_name LIKE '%Functional Microdose%'  THEN 'Functional Microdose'
    WHEN product_name LIKE '%Froot Jam%'             THEN 'Froot Jam'
    WHEN product_name LIKE '%Cereal Crunch%'         THEN 'Cereal Crunchies'
    WHEN product_name LIKE '%THCP%'                  THEN 'THCP'
    WHEN product_name LIKE '%THCA%'                  THEN 'THCA'
    WHEN product_name LIKE '%Liquid Diamond%'        THEN 'THCA'
    ELSE NULL
  END
`

export async function GET(req: NextRequest) {
  try {
    const db   = getDb()
    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    const ymFilter = mode === 'bymonth'
      ? `substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) AS month_key,`
      : ''
    const ymWhere = mode === 'bymonth'
      ? `WHERE month_key != '' AND compound IS NOT NULL`
      : mode === 'today'
      ? (() => {
          const now = new Date()
          const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          return `WHERE ship_date = '${today}' AND compound IS NOT NULL`
        })()
      : (() => {
          const now = new Date()
          const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          return `WHERE substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) = '${ym}' AND compound IS NOT NULL`
        })()
    const groupMonth = mode === 'bymonth' ? 'month_key,' : ''
    const orderMonth = mode === 'bymonth' ? 'month_key DESC,' : ''

    // 1. Overall revenue summary (THCA vs THCP totals)
    const revenue = db.prepare(`
      SELECT ${ymFilter}
        compound,
        COUNT(DISTINCT order_id) AS orders,
        SUM(qty_shipped)         AS qty,
        SUM(amount)              AS revenue
      FROM (
        SELECT *, ${COMPOUND_EXPR} AS compound,
               substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) AS month_key
        FROM shipped_sales_by_product
      ) t
      ${ymWhere}
      GROUP BY ${groupMonth} compound
      ORDER BY ${orderMonth} compound
    `).all()

    // 2. By product (top products per compound)
    const byProduct = db.prepare(`
      SELECT ${ymFilter}
        compound,
        product_id,
        COALESCE(NULLIF(product_name,''), product_id, '—') AS product_name,
        COUNT(DISTINCT order_id) AS orders,
        SUM(qty_shipped)         AS qty,
        SUM(amount)              AS revenue
      FROM (
        SELECT *, ${COMPOUND_EXPR} AS compound,
               substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) AS month_key
        FROM shipped_sales_by_product
      ) t
      ${ymWhere}
      GROUP BY ${groupMonth} compound, product_id
      ORDER BY ${orderMonth} compound, revenue DESC
    `).all()

    // 3. By state (THCA vs THCP revenue per state)
    const byState = db.prepare(`
      SELECT ${ymFilter}
        COALESCE(NULLIF(ship_to_state,''), 'Unknown') AS state,
        compound,
        SUM(qty_shipped) AS qty,
        SUM(amount)      AS revenue
      FROM (
        SELECT *, ${COMPOUND_EXPR} AS compound,
               substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) AS month_key
        FROM shipped_sales_by_product
      ) t
      ${ymWhere}
      GROUP BY ${groupMonth} state, compound
      ORDER BY ${orderMonth} revenue DESC
    `).all()

    return NextResponse.json({ revenue, byProduct, byState })
  } catch (err) {
    return NextResponse.json({ revenue: [], byProduct: [], byState: [], error: String(err) }, { status: 500 })
  }
}
