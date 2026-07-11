import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_sales_csv (
      product_id        TEXT PRIMARY KEY,
      product_name      TEXT,
      category          TEXT,
      sales_7d          REAL,
      sales_30d         REAL,
      sales_60d         REAL,
      sales_90d         REAL,
      sales_180d        REAL,
      sales_last_month  REAL,
      sales_this_month  REAL,
      qty_on_hand       REAL,
      qty_available     REAL,
      average_cost      REAL,
      upc               TEXT,
      imported_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit  = Math.min(500, parseInt(searchParams.get('limit') ?? '200'))
  const search = searchParams.get('search')?.trim() ?? ''
  const offset = (page - 1) * limit

  const db = getDb()
  try {
    ensureTable(db)

    const where = search
      ? `WHERE product_id LIKE ? OR product_name LIKE ? OR category LIKE ?`
      : ''
    const args = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []

    const total = (db.prepare(`SELECT COUNT(*) as c FROM finale_sales_csv ${where}`).get(...args) as { c: number }).c
    const rows  = db.prepare(`SELECT * FROM finale_sales_csv ${where} ORDER BY product_id LIMIT ? OFFSET ?`).all(...args, limit, offset)

    const importedAt = (db.prepare(`SELECT imported_at FROM finale_sales_csv ORDER BY imported_at DESC LIMIT 1`).get() as { imported_at: string } | undefined)?.imported_at ?? null

    return NextResponse.json({ rows, total, page, limit, importedAt })
  } catch {
    return NextResponse.json({ rows: [], total: 0, page: 1, limit, importedAt: null })
  }
}
