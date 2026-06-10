import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_stock_csv (
      product_id   TEXT NOT NULL,
      bin_location TEXT NOT NULL DEFAULT '',
      product_name TEXT,
      category     TEXT,
      qoh          REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, bin_location)
    )
  `)
  try { db.exec(`ALTER TABLE finale_stock_csv ADD COLUMN category TEXT`) } catch { /* already exists */ }
}

export async function GET(req: NextRequest) {
  const db = getDb()
  try {
    ensureSchema(db)

    const url = req.nextUrl
    const page    = Math.max(1, parseInt(url.searchParams.get('page')  || '1'))
    const limit   = Math.min(500, parseInt(url.searchParams.get('limit') || '200'))
    const search  = (url.searchParams.get('search') || '').toLowerCase().trim()
    const offset  = (page - 1) * limit

    // Summary stats (always from full table)
    const totalProducts = (db.prepare(`SELECT COUNT(DISTINCT product_id) as c FROM finale_stock_csv`).get() as { c: number }).c
    const totalUnits    = (db.prepare(`SELECT COALESCE(SUM(qoh),0) as s FROM finale_stock_csv`).get() as { s: number }).s
    const importedAt    = (db.prepare(`SELECT imported_at FROM finale_stock_csv ORDER BY imported_at DESC LIMIT 1`).get() as { imported_at: string } | undefined)?.imported_at ?? null
    const totalBins     = (db.prepare(`SELECT COUNT(*) as c FROM finale_stock_csv`).get() as { c: number }).c

    // Filtered + paginated rows
    let rows: unknown[]
    if (search) {
      rows = db.prepare(`
        SELECT product_id, product_name, category, bin_location, qoh, imported_at
        FROM finale_stock_csv
        WHERE lower(product_id) LIKE ? OR lower(product_name) LIKE ? OR lower(category) LIKE ? OR lower(bin_location) LIKE ?
        ORDER BY product_id, bin_location
        LIMIT ? OFFSET ?
      `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit, offset)
    } else {
      rows = db.prepare(`
        SELECT product_id, product_name, category, bin_location, qoh, imported_at
        FROM finale_stock_csv
        ORDER BY product_id, bin_location
        LIMIT ? OFFSET ?
      `).all(limit, offset)
    }

    const filteredTotal = search
      ? (db.prepare(`SELECT COUNT(*) as c FROM finale_stock_csv WHERE lower(product_id) LIKE ? OR lower(product_name) LIKE ? OR lower(category) LIKE ? OR lower(bin_location) LIKE ?`).get(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) as { c: number }).c
      : totalBins

    return NextResponse.json({ rows, importedAt, totalProducts, totalBins, totalUnits, page, limit, filteredTotal })
  } catch (err) {
    console.error('stock-report error:', err)
    return NextResponse.json({ rows: [], importedAt: null, totalProducts: 0, totalBins: 0, totalUnits: 0, page: 1, limit: 200, filteredTotal: 0 })
  }
}
