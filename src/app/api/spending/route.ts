import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_spending (
      order_id     TEXT,
      order_number TEXT,
      order_status TEXT,
      vendor       TEXT,
      order_date   TEXT,
      product_id   TEXT,
      product_name TEXT,
      qty_ordered  REAL NOT NULL DEFAULT 0,
      unit_cost    REAL NOT NULL DEFAULT 0,
      line_total   REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  try { db.exec(`ALTER TABLE purchase_spending ADD COLUMN order_status TEXT`) } catch {}
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    ensureSchema(db)

    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    const meta = db.prepare(`
      SELECT MAX(imported_at) AS last_import, COUNT(*) AS total,
             MAX(order_date) AS latest_date, MIN(order_date) AS earliest_date
      FROM purchase_spending
    `).get() as { last_import: string | null; total: number; latest_date: string; earliest_date: string }

    if (mode === 'bymonth') {
      const rows = db.prepare(`
        SELECT
          substr(COALESCE(NULLIF(order_date,''), ''), 1, 7) AS month_key,
          order_date, order_status, vendor, order_id,
          product_id,
          COALESCE(NULLIF(product_name,''), product_id, '—') AS product_name,
          qty_ordered, unit_cost, line_total
        FROM purchase_spending
        WHERE month_key != ''
        ORDER BY month_key DESC, order_date DESC, vendor, order_id, product_id
      `).all()
      return NextResponse.json({ rows, meta })
    }

    // thismonth
    const now = new Date()
    const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const rows = db.prepare(`
      SELECT
        order_date, order_status, vendor, order_id,
        product_id,
        COALESCE(NULLIF(product_name,''), product_id, '—') AS product_name,
        qty_ordered, unit_cost, line_total
      FROM purchase_spending
      WHERE substr(COALESCE(NULLIF(order_date,''), ''), 1, 7) = ?
      ORDER BY order_date DESC, vendor, order_id, product_id
    `).all(ym)

    return NextResponse.json({ rows, meta })
  } catch (err) {
    return NextResponse.json({ rows: [], error: String(err) }, { status: 500 })
  }
}
