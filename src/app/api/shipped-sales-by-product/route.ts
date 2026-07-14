import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

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

function parseNum(s: unknown): number {
  return parseFloat(String(s ?? '').replace(/,/g, '').replace(/\$/g, '').trim()) || 0
}

function parseDate(s: string): string {
  if (!s) return ''
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return s.split('T')[0]
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let i = 0
  while (i <= line.length) {
    if (i === line.length) { result.push(''); break }
    if (line[i] === '"') {
      let j = i + 1
      while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) j++
      result.push(line.slice(i + 1, j).replace(/""/g, '"').trim())
      i = j + 2
    } else {
      const j = line.indexOf(',', i)
      if (j === -1) { result.push(line.slice(i).trim()); break }
      result.push(line.slice(i, j).trim())
      i = j + 1
    }
  }
  return result
}

// POST: upload CSV
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const db = getDb()
    ensureSchema(db)
    db.exec(`DELETE FROM shipped_sales_by_product`)

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return NextResponse.json({ error: 'No data rows found' }, { status: 400 })

    const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim())
    const find = (...names: string[]) => names.map(n => headers.findIndex(h => h === n)).find(i => i >= 0) ?? -1

    const iOrderId  = find('order id', 'order_id', 'orderid', 'order number')
    const iProdId   = find('product id', 'product_id', 'productid', 'sku', 'item id')
    const iProdName = find('product name', 'product_name', 'productname', 'item name', 'description')
    const iSource   = find('source', 'order source', 'sale source', 'channel')
    const iShipDate = find('ship date', 'ship_date', 'shipdate', 'date shipped')
    const iQty      = find('qty shipped', 'qty_shipped', 'quantity shipped', 'qty', 'quantity')
    const iPrice    = find('unit price', 'unit_price', 'price')
    const iSubtotal = find('subtotal', 'sub total', 'total', 'line total')

    const stmt = db.prepare(`
      INSERT INTO shipped_sales_by_product (order_id, product_id, product_name, source, ship_date, qty_shipped, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let inserted = 0
    for (const line of lines.slice(1)) {
      const v = splitCsvLine(line)
      const productId   = iProdId   >= 0 ? v[iProdId]   : ''
      const productName = iProdName >= 0 ? v[iProdName] : ''
      if (!productId && !productName) continue
      stmt.run(
        iOrderId  >= 0 ? v[iOrderId]  : '',
        productId,
        productName,
        iSource   >= 0 ? v[iSource]   : '',
        iShipDate >= 0 ? parseDate(v[iShipDate]) : '',
        iQty      >= 0 ? parseNum(v[iQty])      : 0,
        iPrice    >= 0 ? parseNum(v[iPrice])     : 0,
        iSubtotal >= 0 ? parseNum(v[iSubtotal])  : 0,
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
    const meta = db.prepare(`SELECT MAX(imported_at) as last_import, COUNT(*) as total FROM shipped_sales_by_product`).get() as { last_import: string | null; total: number }

    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    if (mode === 'bymonth') {
      const agg = db.prepare(`
        SELECT
          substr(COALESCE(NULLIF(ship_date,''), ''), 1, 7) AS month_key,
          COALESCE(NULLIF(product_name,''), product_id, '—') AS product,
          product_id,
          SUM(qty_shipped)  AS qty,
          SUM(subtotal)     AS revenue
        FROM shipped_sales_by_product
        WHERE month_key != ''
        GROUP BY month_key, product
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
      GROUP BY product
      ORDER BY revenue DESC
    `).all(`${ym}%`)
    return NextResponse.json({ agg, meta })
  } catch (err) {
    return NextResponse.json({ agg: [], error: String(err) }, { status: 500 })
  }
}
