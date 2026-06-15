import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  try {
    const rows = db.prepare(`
      SELECT
        s.product_id,
        MAX(s.product_name)                          AS product_name,
        SUM(s.qoh)                                   AS qoh,
        CAST(NULLIF(sv.sales_60d, '') AS REAL)        AS sales_60d
      FROM finale_stock_csv s
      LEFT JOIN finale_sales_csv sv ON sv.product_id = s.product_id
      WHERE s.product_id LIKE '%-01'
        AND s.product_id NOT LIKE '%-QP-%'
        AND s.product_id NOT LIKE '%-14-%'
        AND s.product_id NOT LIKE '%-450-%'
        AND upper(s.product_id) NOT LIKE 'S-%'
        AND upper(s.product_id) NOT LIKE 'VIP-%'
      GROUP BY s.product_id
      ORDER BY s.product_id
    `).all() as {
      product_id: string
      product_name: string | null
      qoh: number
      sales_60d: number | null
    }[]

    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ rows: [], error: String(err) })
  }
}
