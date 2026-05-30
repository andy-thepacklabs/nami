import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getDb()
  const q = new URL(req.url).searchParams.get('q')

  try {
    if (q) {
      const rows = db.prepare(`
        SELECT cs.facility_url, cs.facility_name,
               COUNT(DISTINCT cs.product_id) AS product_count,
               SUM(cs.net_qty) AS total_qty
        FROM computed_stock cs
        WHERE cs.facility_name LIKE ? OR cs.facility_url LIKE ?
        GROUP BY cs.facility_url, cs.facility_name
        HAVING total_qty > 0
        ORDER BY cs.facility_name
        LIMIT 50
      `).all(`%${q}%`, `%${q}%`)
      return NextResponse.json({ rows })
    }

    const rows = db.prepare(`
      SELECT cs.facility_url, cs.facility_name,
             COUNT(DISTINCT cs.product_id) AS product_count,
             SUM(cs.net_qty) AS total_qty
      FROM computed_stock cs
      GROUP BY cs.facility_url, cs.facility_name
      HAVING total_qty > 0
      ORDER BY product_count DESC
      LIMIT 100
    `).all()
    return NextResponse.json({ rows })
  } catch {
    return NextResponse.json({ rows: [], error: 'No stock data — run a Finale sync first' })
  }
}
