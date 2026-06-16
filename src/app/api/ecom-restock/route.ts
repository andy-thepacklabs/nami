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
        CAST(NULLIF(sv.sales_60d, '') AS REAL)        AS sales_60d,
        GROUP_CONCAT(DISTINCT CASE
          WHEN s.bin_location LIKE 'SFS-A%' OR s.bin_location LIKE 'SFS-B%'
            OR s.bin_location LIKE 'SFS-C%' OR s.bin_location LIKE 'SFS-D%'
            OR s.bin_location LIKE 'SFS-E%'
            OR s.bin_location LIKE 'SFS-P-%'
          THEN s.bin_location ELSE NULL END) AS bin_locations
      FROM finale_stock_csv s
      LEFT JOIN finale_sales_csv sv ON sv.product_id = s.product_id
      WHERE s.product_id LIKE '%-01'
        AND s.product_id NOT LIKE '%-QP-%'
        AND s.product_id NOT LIKE '%-14-%'
        AND s.product_id NOT LIKE '%-450-%'
        AND upper(s.product_id) NOT LIKE 'S-%'
        AND upper(s.product_id) NOT LIKE 'VIP-%'
        AND upper(COALESCE(s.product_name,'')) NOT LIKE '%MARKETING%'
      GROUP BY s.product_id
      ORDER BY s.product_id
    `).all() as {
      product_id: string
      product_name: string | null
      qoh: number
      sales_60d: number | null
      bin_locations: string | null
    }[]

    // Also fetch bin locations for all display pack parents from bom_entries
    let packBins: { product_id: string; bin_locations: string | null }[] = []
    try {
      packBins = db.prepare(`
        SELECT s.product_id, GROUP_CONCAT(DISTINCT CASE
          WHEN s.bin_location LIKE 'SFS-A%' OR s.bin_location LIKE 'SFS-B%'
            OR s.bin_location LIKE 'SFS-C%' OR s.bin_location LIKE 'SFS-D%'
            OR s.bin_location LIKE 'SFS-E%'
            OR s.bin_location LIKE 'SFS-P-%'
          THEN s.bin_location ELSE NULL END) AS bin_locations
        FROM finale_stock_csv s
        WHERE s.product_id IN (SELECT DISTINCT parent_id FROM bom_entries)
        GROUP BY s.product_id
      `).all() as { product_id: string; bin_locations: string | null }[]
    } catch { /* bom_entries may not exist yet */ }

    return NextResponse.json({ rows, packBins })
  } catch (err) {
    return NextResponse.json({ rows: [], error: String(err) })
  }
}
