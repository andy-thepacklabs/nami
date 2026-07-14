import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import * as XLSX from 'xlsx'

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

function parseNum(s: unknown): number {
  return parseFloat(String(s ?? '').replace(/,/g, '').replace(/\$/g, '').trim()) || 0
}

function parseExcelDate(v: unknown): string {
  if (!v) return ''
  // Excel serial number → date
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  // M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  // ISO or other
  return s.split('T')[0]
}

function col(row: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.toLowerCase().trim() === n.toLowerCase())
    if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]).trim()
  }
  return ''
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
      if (i < line.length && line[i - 1] !== ',') i++ // skip comma after closing quote
    } else {
      const j = line.indexOf(',', i)
      if (j === -1) { result.push(line.slice(i).trim()); break }
      result.push(line.slice(i, j).trim())
      i = j + 1
    }
  }
  return result
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const db = getDb()
    ensureSchema(db)
    db.exec(`DELETE FROM shipped_sales_csv`)

    const stmt = db.prepare(`
      INSERT INTO shipped_sales_csv
        (order_id, customer, order_date, ship_date, product_id, product_name, category, qty_shipped, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let inserted = 0
    const name = file.name.toLowerCase()

    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      // ── Excel path ──
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'buffer', cellDates: false })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      // Use raw array rows (header:1) so we access by column INDEX, not header string
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

      // Row 0 is the header; detect column positions from it
      const headers = (allRows[0] as string[]).map(h => String(h).toLowerCase().trim())
      const iSource   = headers.findIndex(h => h === 'source' || h === 'order source')
      const iOrderId  = headers.findIndex(h => h === 'order id' || h === 'order_id' || h === 'orderid')
      const iShipDate = headers.findIndex(h => h === 'ship date' || h === 'ship_date' || h === 'shipdate')
      const iSubtotal = headers.findIndex(h => h === 'subtotal' || h === 'sub total')
      // Fallback to fixed positions if detection fails: Source=0, OrderID=1, ShipDate=2, Subtotal=3
      const cSource   = iSource   >= 0 ? iSource   : 0
      const cOrderId  = iOrderId  >= 0 ? iOrderId  : 1
      const cShipDate = iShipDate >= 0 ? iShipDate : 2
      const cSubtotal = iSubtotal >= 0 ? iSubtotal : 3

      for (const rawRow of allRows.slice(1)) {
        const row = rawRow as unknown[]
        const customer = String(row[cSource]  ?? '').trim() || '—'
        const orderId  = String(row[cOrderId] ?? '').trim()
        const shipDate = parseExcelDate(row[cShipDate])
        const subtotal = parseNum(row[cSubtotal])

        if (!orderId && customer === '—') continue
        stmt.run(orderId, customer, '', shipDate, '', '', '', 0, 0, subtotal)
        inserted++
      }
    } else {
      // ── CSV path ──
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length === 0) return NextResponse.json({ error: 'No data rows found' }, { status: 400 })

      for (const row of rows) {
        const orderId    = col(row, 'order id', 'order_id', 'orderid', 'order number', 'order#')
        const customer   = col(row, 'source', 'order source', 'customer', 'customer name')
        const orderDate  = col(row, 'order date', 'order_date', 'orderdate', 'date ordered')
        const shipDateRaw = col(row, 'ship date', 'ship_date', 'shipdate', 'date shipped')
        const shipDate    = parseExcelDate(shipDateRaw)
        const subtotal    = parseNum(col(row, 'subtotal', 'sub total', 'total', 'amount'))
        if (!orderId && !customer) continue
        stmt.run(orderId, customer || '—', orderDate, shipDate, '', '', '', 0, 0, subtotal)
        inserted++
      }
    }

    return NextResponse.json({ ok: true, inserted })
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
