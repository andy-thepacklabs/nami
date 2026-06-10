import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS finale_stock_csv (
        product_id   TEXT NOT NULL,
        bin_location TEXT NOT NULL DEFAULT '',
        product_name TEXT,
        qoh          REAL NOT NULL DEFAULT 0,
        imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (product_id, bin_location)
      )
    `)

    // Add category column if missing (schema migration)
    try { db.exec(`ALTER TABLE finale_stock_csv ADD COLUMN category TEXT`) } catch { /* already exists */ }

    const rows = db.prepare(`
      SELECT
        product_id,
        product_name,
        category,
        bin_location,
        qoh,
        imported_at
      FROM finale_stock_csv
      ORDER BY product_id, bin_location
    `).all() as { product_id: string; product_name: string; category: string; bin_location: string; qoh: number; imported_at: string }[]

    const importedAt = rows[0]?.imported_at ?? null
    const totalProducts = new Set(rows.map(r => r.product_id)).size
    const totalUnits = rows.reduce((s, r) => s + r.qoh, 0)

    return NextResponse.json({ rows, importedAt, totalProducts, totalUnits })
  } catch {
    return NextResponse.json({ rows: [], importedAt: null, totalProducts: 0, totalUnits: 0 })
  }
}
