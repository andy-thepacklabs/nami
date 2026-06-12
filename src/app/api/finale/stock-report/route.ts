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
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_consumed_90d (
      product_id TEXT PRIMARY KEY,
      quantity   REAL NOT NULL DEFAULT 0,
      synced_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  try { db.exec(`ALTER TABLE finale_stock_csv ADD COLUMN category TEXT`) } catch { /* already exists */ }
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    ensureSchema(db)

    const search = (req.nextUrl.searchParams.get('search') || '').toLowerCase().trim()
    const page   = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'))
    const limit  = 200
    const offset = (page - 1) * limit

    // Always fetch summary from full table
    const stats = db.prepare(
      `SELECT COUNT(DISTINCT product_id) as products, COUNT(*) as bins, COALESCE(SUM(qoh),0) as units FROM finale_stock_csv`
    ).get() as { products: number; bins: number; units: number }

    const importedAt = (db.prepare(
      `SELECT imported_at FROM finale_stock_csv ORDER BY rowid DESC LIMIT 1`
    ).get() as { imported_at: string } | undefined)?.imported_at ?? null

    // Fetch rows — with or without search filter
    let rows: unknown[]
    let filteredTotal: number

    const selectCols = `
      s.product_id, s.product_name, s.category, s.bin_location, s.qoh,
      MAX(s.available) OVER (PARTITION BY s.product_id) AS available,
      CAST(NULLIF(c.quantity, '') AS REAL) AS consumed_90d,
      CAST(NULLIF(sv.sales_7d,'') AS REAL) AS sales_7d,
      CAST(NULLIF(sv.sales_30d,'') AS REAL) AS sales_30d,
      CAST(NULLIF(sv.sales_60d,'') AS REAL) AS sales_60d,
      CAST(NULLIF(sv.sales_90d,'') AS REAL) AS sales_90d,
      sv.sales_this_month, sv.sales_last_month`

    const joins = `
      FROM finale_stock_csv s
      LEFT JOIN finale_consumed_90d c ON c.product_id = s.product_id
      LEFT JOIN finale_sales_csv sv ON sv.product_id = s.product_id`

    if (search) {
      const s = search
      rows = db.prepare(
        `SELECT ${selectCols} ${joins}
         WHERE instr(lower(s.product_id),?) OR instr(lower(COALESCE(s.product_name,'')),?) OR instr(lower(COALESCE(s.category,'')),?) OR instr(lower(COALESCE(s.bin_location,'')),?)
         ORDER BY s.product_id, s.bin_location LIMIT ? OFFSET ?`
      ).all(s, s, s, s, limit, offset)

      filteredTotal = (db.prepare(
        `SELECT COUNT(*) as c FROM finale_stock_csv
         WHERE instr(lower(product_id),?) OR instr(lower(COALESCE(product_name,'')),?) OR instr(lower(COALESCE(category,'')),?) OR instr(lower(COALESCE(bin_location,'')),?)`
      ).get(s, s, s, s) as { c: number }).c
    } else {
      rows = db.prepare(
        `SELECT ${selectCols} ${joins}
         ORDER BY s.product_id, s.bin_location LIMIT ? OFFSET ?`
      ).all(limit, offset)
      filteredTotal = stats.bins
    }

    return NextResponse.json({
      rows,
      importedAt,
      totalProducts: stats.products,
      totalBins: stats.bins,
      totalUnits: stats.units,
      page,
      limit,
      filteredTotal,
    })
  } catch (err) {
    console.error('[stock-report]', err)
    return NextResponse.json({
      rows: [], importedAt: null,
      totalProducts: 0, totalBins: 0, totalUnits: 0,
      page: 1, limit: 200, filteredTotal: 0,
      error: String(err),
    })
  }
}
