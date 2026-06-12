import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function tryQuery<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

export async function GET(req: Request) {
  const db = getDb()

  // Debug: ?categories=1 returns distinct category values
  if (new URL(req.url).searchParams.get('categories')) {
    const rows = db.prepare(`SELECT DISTINCT category, COUNT(DISTINCT product_id) as cnt FROM finale_stock_csv GROUP BY category ORDER BY cnt DESC`).all()
    return NextResponse.json(rows)
  }

  // Ensure tables exist
  tryQuery(() => db.exec(`CREATE TABLE IF NOT EXISTS finale_stock_csv (
    product_id TEXT, bin_location TEXT, product_name TEXT, category TEXT,
    qoh REAL DEFAULT 0, available REAL, imported_at TEXT,
    PRIMARY KEY (product_id, bin_location)
  )`), undefined)
  tryQuery(() => db.exec(`CREATE TABLE IF NOT EXISTS finale_consumed_90d (
    product_id TEXT PRIMARY KEY, quantity REAL, synced_at TEXT
  )`), undefined)
  tryQuery(() => db.exec(`CREATE TABLE IF NOT EXISTS finale_sales_csv (
    product_id TEXT PRIMARY KEY, product_name TEXT, category TEXT,
    sales_90d REAL, sales_30d REAL, sales_7d REAL,
    sales_this_month REAL, sales_last_month REAL, average_cost REAL, imported_at TEXT
  )`), undefined)

  const STOCK_FILTER = `category IN ('FINISHED GOODS', 'RAW MATERIALS', 'MARKETING')`

  // Total SKUs — all categories (matches Finale Report)
  const totalSkus = tryQuery(() => {
    const r = db.prepare(`SELECT COUNT(DISTINCT product_id) AS total FROM finale_stock_csv`).get() as { total: number }
    return r?.total ?? 0
  }, 0)

  // Total inventory value — all categories (matches Finale Report)
  const totalValue = tryQuery(() => {
    const r = db.prepare(`
      SELECT SUM(sq.qoh * COALESCE(sv.average_cost, 0)) AS total_value
      FROM (SELECT product_id, SUM(qoh) AS qoh FROM finale_stock_csv GROUP BY product_id) sq
      LEFT JOIN finale_sales_csv sv ON sv.product_id = sq.product_id
    `).get() as { total_value: number | null }
    return r?.total_value ?? 0
  }, 0)

  // Low stock (MoH < 2) — Finished Goods + Raw Materials + Marketing
  const lowStock = tryQuery(() => {
    const r = db.prepare(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT s.product_id, SUM(s.qoh) / (c.quantity / 3.0) AS moh
        FROM finale_stock_csv s
        JOIN finale_consumed_90d c ON c.product_id = s.product_id
        WHERE c.quantity > 0 AND s.${STOCK_FILTER}
        GROUP BY s.product_id
        HAVING moh < 2
      )
    `).get() as { cnt: number }
    return r?.cnt ?? 0
  }, 0)

  // Out of stock — Finished Goods + Raw Materials + Marketing
  const outOfStock = tryQuery(() => {
    const r = db.prepare(`SELECT COUNT(DISTINCT product_id) AS cnt FROM finale_stock_csv WHERE qoh <= 0 AND ${STOCK_FILTER}`).get() as { cnt: number }
    return r?.cnt ?? 0
  }, 0)

  // Inventory by category — total qty + value per category
  const byCategory = tryQuery(() =>
    db.prepare(`
      SELECT COALESCE(s.category, 'Other') AS category,
             SUM(s.qoh) AS total_qty,
             SUM(s.qoh * COALESCE(sv.average_cost, 0)) AS total_value,
             COUNT(DISTINCT s.product_id) AS sku_count
      FROM finale_stock_csv s
      LEFT JOIN finale_sales_csv sv ON sv.product_id = s.product_id
      WHERE s.qoh > 0
      GROUP BY s.category
      ORDER BY total_qty DESC
    `).all() as { category: string; total_qty: number; total_value: number; sku_count: number }[]
  , [])

  // Top 5 reorder
  const reorderTop = tryQuery(() =>
    db.prepare(`
      SELECT s.product_id, s.product_name, s.category,
             SUM(s.qoh) AS qoh,
             c.quantity AS consumed_90d,
             ROUND(c.quantity / 3.0, 1) AS monthly_req,
             ROUND(SUM(s.qoh) / (c.quantity / 3.0), 2) AS mo_on_hand
      FROM finale_stock_csv s
      JOIN finale_consumed_90d c ON c.product_id = s.product_id
      WHERE c.quantity > 0 AND s.category = 'RAW MATERIALS'
      GROUP BY s.product_id
      HAVING mo_on_hand < 2
      ORDER BY mo_on_hand ASC
      LIMIT 5
    `).all() as { product_id: string; product_name: string | null; category: string | null; qoh: number; consumed_90d: number; monthly_req: number; mo_on_hand: number }[]
  , [])

  // Top 5 consumed
  const topConsumed = tryQuery(() =>
    db.prepare(`
      SELECT c.product_id, s.product_name, s.category,
             c.quantity AS consumed_90d,
             ROUND(c.quantity / 90.0 * 7, 0) AS consumed_7d
      FROM finale_consumed_90d c
      LEFT JOIN (SELECT product_id, product_name, category FROM finale_stock_csv GROUP BY product_id) s
        ON s.product_id = c.product_id
      WHERE c.quantity > 0
      ORDER BY c.quantity DESC
      LIMIT 5
    `).all() as { product_id: string; product_name: string | null; category: string | null; consumed_90d: number; consumed_7d: number }[]
  , [])

  // Top 30 selling — Finished Goods only
  const topSelling = tryQuery(() =>
    db.prepare(`
      SELECT product_id, product_name, category, sales_7d, sales_30d, sales_60d, sales_90d
      FROM finale_sales_csv
      WHERE sales_90d > 0 AND category = 'FINISHED GOODS'
      ORDER BY sales_90d DESC
      LIMIT 30
    `).all() as { product_id: string; product_name: string | null; category: string | null; sales_7d: number; sales_30d: number; sales_60d: number; sales_90d: number }[]
  , [])

  return NextResponse.json({ totalValue, totalSkus, lowStock, outOfStock, byCategory, reorderTop, topConsumed, topSelling })
}
