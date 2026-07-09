import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipped_sales_csv (
      order_id     TEXT NOT NULL,
      customer     TEXT,
      order_date   TEXT,
      ship_date    TEXT,
      product_id   TEXT,
      product_name TEXT,
      category     TEXT,
      qty_shipped  REAL NOT NULL DEFAULT 0,
      unit_price   REAL NOT NULL DEFAULT 0,
      subtotal     REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

function parseNum(s: string): number {
  return parseFloat(String(s ?? '').replace(/,/g, '').replace(/\$/g, '').trim()) || 0
}

// Try to find a column by multiple possible header names
function col(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.toLowerCase().trim() === n.toLowerCase())
    if (key && row[key] !== undefined) return row[key].trim()
  }
  return ''
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]*)/g) ?? []
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim()
    })
    return row
  })
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length === 0) return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 })

    const db = getDb()
    ensureSchema(db)

    // Clear existing data
    db.exec(`DELETE FROM shipped_sales_csv`)

    let inserted = 0
    const stmt = db.prepare(`
      INSERT INTO shipped_sales_csv
        (order_id, customer, order_date, ship_date, product_id, product_name, category, qty_shipped, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rows) {
      const orderId    = col(row, 'order id', 'order_id', 'orderid', 'order number', 'order#', 'sales order')
      const customer   = col(row, 'customer', 'customer name', 'bill to name', 'ship to name')
      const orderDate  = col(row, 'order date', 'order_date', 'orderdate', 'date ordered')
      const shipDate   = col(row, 'ship date', 'ship_date', 'shipdate', 'date shipped', 'shipped date')
      const productId  = col(row, 'product id', 'product_id', 'sku', 'item id', 'item number')
      const productName = col(row, 'product name', 'product_name', 'description', 'item name', 'item description')
      const category   = col(row, 'category', 'product category', 'item category')
      const qty        = parseNum(col(row, 'quantity', 'qty', 'qty shipped', 'quantity shipped', 'units shipped'))
      const unitPrice  = parseNum(col(row, 'unit price', 'unit_price', 'price', 'sell price', 'unit cost'))
      const subtotal   = parseNum(col(row, 'subtotal', 'sub total', 'line total', 'total', 'amount', 'extended price'))

      if (!orderId && !productId) continue

      stmt.run(orderId, customer, orderDate, shipDate, productId, productName, category, qty, unitPrice, subtotal)
      inserted++
    }

    return NextResponse.json({ ok: true, inserted, headers: Object.keys(rows[0] ?? {}) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const db = getDb()
    ensureSchema(db)
    const rows = db.prepare(`SELECT * FROM shipped_sales_csv ORDER BY ship_date DESC, order_date DESC`).all()
    const meta = db.prepare(`SELECT MAX(imported_at) as last_import, COUNT(*) as total FROM shipped_sales_csv`).get() as { last_import: string | null; total: number }
    return NextResponse.json({ rows, meta })
  } catch (err) {
    return NextResponse.json({ rows: [], error: String(err) }, { status: 500 })
  }
}
