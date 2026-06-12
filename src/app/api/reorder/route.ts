import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  try {
    // Top 30 selling SKUs by sales_90d — Finished Goods only
    const topSelling = db.prepare(`
      SELECT sv.product_id, sv.product_name, sv.category,
             sv.sales_90d, sv.sales_30d, sv.sales_7d,
             sv.sales_this_month, sv.sales_last_month,
             COALESCE(SUM(s.qoh), 0) AS qoh
      FROM finale_sales_csv sv
      LEFT JOIN finale_stock_csv s ON s.product_id = sv.product_id
      WHERE sv.sales_90d IS NOT NULL AND sv.sales_90d > 0
        AND UPPER(TRIM(sv.category)) = 'FINISHED GOODS'
      GROUP BY sv.product_id
      ORDER BY sv.sales_90d DESC
      LIMIT 30
    `).all() as unknown as TopSellingRow[]

    // Top 30 consumed materials by consumed_90d — Raw Materials only
    const topConsumed = db.prepare(`
      SELECT c.product_id, s.product_name, s.category,
             c.quantity AS consumed_90d,
             COALESCE(SUM(st.qoh), 0) AS qoh,
             MAX(st.available) AS available
      FROM finale_consumed_90d c
      LEFT JOIN finale_stock_csv st ON st.product_id = c.product_id
      LEFT JOIN (SELECT product_id, product_name, category FROM finale_stock_csv GROUP BY product_id) s
        ON s.product_id = c.product_id
      WHERE c.quantity > 0
        AND UPPER(TRIM(s.category)) = 'RAW MATERIALS'
      GROUP BY c.product_id
      ORDER BY c.quantity DESC
      LIMIT 30
    `).all() as unknown as TopConsumedRow[]

    // Reorder recommendations: Mo On Hand < 2 months — Raw Materials only
    const reorderRecs = db.prepare(`
      SELECT s.product_id, s.product_name, s.category,
             SUM(s.qoh) AS qoh,
             MAX(s.available) AS available,
             c.quantity AS consumed_90d,
             sv.sales_90d,
             CASE
               WHEN c.quantity > 0 THEN ROUND(c.quantity / 3.0, 1)
               ELSE NULL
             END AS monthly_required,
             CASE
               WHEN c.quantity > 0 AND SUM(s.qoh) >= 0
               THEN ROUND(SUM(s.qoh) / (c.quantity / 3.0), 2)
               ELSE NULL
             END AS mo_on_hand
      FROM finale_stock_csv s
      LEFT JOIN finale_consumed_90d c ON c.product_id = s.product_id
      LEFT JOIN finale_sales_csv sv ON sv.product_id = s.product_id
      WHERE c.quantity > 0
        AND UPPER(TRIM(s.category)) = 'RAW MATERIALS'
      GROUP BY s.product_id
      HAVING mo_on_hand IS NOT NULL AND mo_on_hand < 2
      ORDER BY mo_on_hand ASC
      LIMIT 100
    `).all() as unknown as ReorderRow[]

    return NextResponse.json({ topSelling, topConsumed, reorderRecs })
  } catch (err) {
    console.error('[reorder]', err)
    return NextResponse.json({ topSelling: [], topConsumed: [], reorderRecs: [], error: String(err) })
  }
}

interface TopSellingRow {
  product_id: string; product_name: string | null; category: string | null
  sales_90d: number; sales_30d: number | null; sales_7d: number | null
  sales_this_month: number | null; sales_last_month: number | null; qoh: number
}
interface TopConsumedRow {
  product_id: string; product_name: string | null; category: string | null
  consumed_90d: number; qoh: number; available: number
}
interface ReorderRow {
  product_id: string; product_name: string | null; category: string | null
  qoh: number; available: number; consumed_90d: number | null
  sales_90d: number | null; monthly_required: number | null; mo_on_hand: number | null
}
