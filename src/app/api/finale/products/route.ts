import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getDb()
  const q = new URL(req.url).searchParams.get('q')

  try {
    if (q) {
      const rows = db.prepare(`
        SELECT product_id, internal_name, status, product_type,
               container_id, upc, cost, category, synced_at
        FROM finale_products
        WHERE product_id LIKE ? OR internal_name LIKE ? OR category LIKE ? OR container_id LIKE ?
        ORDER BY internal_name LIMIT 100
      `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
      return NextResponse.json({ rows, total: rows.length })
    }

    const rows = db.prepare(`
      SELECT product_id, internal_name, status, product_type,
             container_id, upc, cost, category, synced_at
      FROM finale_products
      ORDER BY internal_name LIMIT 100
    `).all()
    const total = (db.prepare(`SELECT COUNT(*) as c FROM finale_products`).get() as { c: number }).c
    return NextResponse.json({ rows, total })
  } catch {
    return NextResponse.json({ rows: [], total: 0, error: 'No synced data yet — run a sync first' })
  }
}
