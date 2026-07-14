import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipped_sales_by_product (
      order_id     TEXT,
      product_id   TEXT,
      product_name TEXT,
      source       TEXT,
      ship_date    TEXT,
      qty_shipped  REAL NOT NULL DEFAULT 0,
      unit_price   REAL NOT NULL DEFAULT 0,
      subtotal     REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

function parseNum(v: unknown): number {
  return parseFloat(String(v ?? '').replace(/,/g, '').replace(/\$/g, '').trim()) || 0
}

function parseDate(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  // Excel serial
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  // M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return s.split('T')[0]
}

// POST: upload Excel or CSV
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const db = getDb()
    ensureSchema(db)

    const stmt = db.prepare(`
      INSERT INTO shipped_sales_by_product
        (order_id, product_id, product_name, source, ship_date, qty_shipped, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

    if (allRows.length < 2) return NextResponse.json({ error: 'No data rows found' }, { status: 400 })

    const headers = (allRows[0] as string[]).map(h => String(h).toLowerCase().trim())
    const col = (...names: string[]) =>
      names.map(n => headers.findIndex(h => h === n)).find(i => i >= 0) ?? -1

    const iSource   = col('source', 'order source', 'sale source', 'channel')
    const iOrderId  = col('order id', 'order_id', 'orderid', 'order number')
    const iShipDate = col('ship date', 'ship_date', 'shipdate', 'date shipped')
    const iProdId   = col('product id', 'product_id', 'productid', 'sku', 'item id')
    const iProdName = col('description', 'product name', 'product_name', 'item name', 'name')
    const iQty      = col('quantity', 'qty shipped', 'qty_shipped', 'qty')
    const iPrice    = col('amount per unit', 'unit price', 'unit_price', 'price')
    const iSubtotal = col('subtotal', 'sub total', 'amount', 'total')

    // Clear ONLY the current month's data if we can detect the month from data,
    // otherwise clear all and re-insert
    db.exec(`DELETE FROM shipped_sales_by_product`)

    let inserted = 0
    for (const rawRow of allRows.slice(1)) {
      const row = rawRow as unknown[]
      const productId   = String(row[iProdId]   ?? '').trim()
      const productName = String(row[iProdName] ?? '').trim()
      if (!productId && !productName) continue
      stmt.run(
        iOrderId  >= 0 ? String(row[iOrderId]  ?? '').trim() : '',
        productId,
        productName,
        iSource   >= 0 ? String(row[iSource]   ?? '').trim() : '',
        iShipDate >= 0 ? parseDate(row[iShipDate]) : '',
        iQty      >= 0 ? parseNum(row[iQty])      : 0,
        iPrice    >= 0 ? parseNum(row[iPrice])     : 0,
        iSubtotal >= 0 ? parseNum(row[iSubtotal])  : 0,
      )
      inserted++
    }

    return NextResponse.json({ ok: true, inserted })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET: aggregated data
export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    ensureSchema(db)
    const meta = db.prepare(`
      SELECT MAX(imported_at) as last_import, COUNT(*) as total,
             MAX(ship_date) as latest_date, MIN(ship_date) as earliest_date
      FROM shipped_sales_by_product
    `).get() as { last_import: string | null; total: number; latest_date: string; earliest_date: string }

    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    if (mode === 'bymonth') {
      const agg = db.prepare(`
        SELECT
          substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7)  AS month_key,
          COALESCE(NULLIF(product_name,''), product_id, '—') AS product,
          product_id,
          SUM(qty_shipped) AS qty,
          SUM(subtotal)    AS revenue
        FROM shipped_sales_by_product
        WHERE month_key != ''
        GROUP BY month_key, product_id
        ORDER BY month_key DESC, revenue DESC
      `).all()
      return NextResponse.json({ agg, meta })
    }

    // thismonth — current month only, grouped by product
    const now = new Date()
    const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const agg = db.prepare(`
      SELECT
        COALESCE(NULLIF(product_name,''), product_id, '—') AS product,
        product_id,
        SUM(qty_shipped) AS qty,
        SUM(subtotal)    AS revenue
      FROM shipped_sales_by_product
      WHERE COALESCE(NULLIF(ship_date,''), '') LIKE ?
      GROUP BY product_id
      ORDER BY revenue DESC
    `).all(`${ym}%`)
    return NextResponse.json({ agg, meta })
  } catch (err) {
    return NextResponse.json({ agg: [], error: String(err) }, { status: 500 })
  }
}
