import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getDb()
  const q = new URL(req.url).searchParams.get('q')

  try {
    if (q) {
      const rows = db.prepare(`
        SELECT s.product_id, s.facility_id, s.qty_on_hand, s.qty_available,
               s.qty_reserved, s.lot_id, s.synced_at,
               p.lookup_code, p.description,
               f.facility_name
        FROM finale_stock s
        LEFT JOIN finale_products p ON p.product_id = s.product_id
        LEFT JOIN finale_facilities f ON f.facility_id = s.facility_id
        WHERE s.product_id LIKE ? OR s.facility_id LIKE ?
              OR p.lookup_code LIKE ? OR f.facility_name LIKE ?
        ORDER BY p.lookup_code, f.facility_name LIMIT 100
      `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
      return NextResponse.json({ rows, total: rows.length })
    }

    const rows = db.prepare(`
      SELECT s.product_id, s.facility_id, s.qty_on_hand, s.qty_available,
             s.qty_reserved, s.lot_id, s.synced_at,
             p.lookup_code, p.description,
             f.facility_name
      FROM finale_stock s
      LEFT JOIN finale_products p ON p.product_id = s.product_id
      LEFT JOIN finale_facilities f ON f.facility_id = s.facility_id
      ORDER BY p.lookup_code, f.facility_name LIMIT 200
    `).all()
    const total = (db.prepare(`SELECT COUNT(*) as c FROM finale_stock`).get() as { c: number }).c
    return NextResponse.json({ rows, total })
  } catch {
    return NextResponse.json({ rows: [], total: 0, error: 'No synced data yet — run a sync first' })
  }
}
