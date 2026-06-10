import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS finale_consumed_90d (
        product_id TEXT PRIMARY KEY,
        quantity   REAL NOT NULL DEFAULT 0,
        synced_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    const rows = db.prepare(`
      SELECT s.product_id, s.product_name,
             SUM(s.qoh) as qoh,
             MAX(s.available) as available,
             c.quantity as consumed_90d
      FROM finale_stock_csv s
      LEFT JOIN finale_consumed_90d c ON c.product_id = s.product_id
      WHERE s.product_id LIKE 'LBL-%'
      GROUP BY s.product_id
      ORDER BY s.product_id
    `).all() as { product_id: string; product_name: string | null; qoh: number; available: number; consumed_90d: number | null }[]
    return NextResponse.json({ rows })
  } catch {
    return NextResponse.json({ rows: [], error: 'Finale data not synced yet.' })
  }
}
