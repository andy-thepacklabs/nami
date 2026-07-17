import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commit_sales (
      order_id      TEXT NOT NULL,
      order_date    TEXT,
      status        TEXT,
      customer      TEXT,
      origin        TEXT,
      subtotal      REAL NOT NULL DEFAULT 0,
      tax_discount  REAL NOT NULL DEFAULT 0,
      taxable_sub   REAL NOT NULL DEFAULT 0,
      tax           REAL NOT NULL DEFAULT 0,
      nontax_discount REAL NOT NULL DEFAULT 0,
      total         REAL NOT NULL DEFAULT 0,
      imported_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS commit_sales_detail (
      order_id TEXT, order_date TEXT, source TEXT, status TEXT, category TEXT,
      product_id TEXT, product_name TEXT,
      qty REAL NOT NULL DEFAULT 0, unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

function parseNum(v: unknown): number {
  return parseFloat(String(v ?? '').replace(/,/g, '').replace(/\$/g, '').trim()) || 0
}

function parseDate(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return s.split('T')[0]
}

// POST: upload Sales Order Summary Excel
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const db = getDb()
    ensureSchema(db)

    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

    if (allRows.length < 2) return NextResponse.json({ error: 'No data rows found' }, { status: 400 })

    const headers = (allRows[0] as string[]).map(h => String(h).toLowerCase().trim())
    const col = (...names: string[]) =>
      names.map(n => headers.findIndex(h => h === n || h.trim() === n)).find(i => i >= 0) ?? -1

    const iOrderDate  = col('order date', 'order_date', 'date')
    const iStatus     = col('status')
    const iOrderId    = col('order id', 'order_id', 'orderid')
    const iCustomer   = col('customer')
    const iOrigin     = col('origin', 'source', 'sale source')
    const iSubtotal   = col('subtotal')
    const iTaxDisc    = col('taxable discount/fee', 'taxable discount')
    const iTaxSub     = col('taxable subtotal')
    const iTax        = col('tax')
    const iNontaxDisc = col('nontaxable discount/fee', 'nontaxable discount')
    const iTotal      = col('total')

    const dates = new Set<string>()
    for (const rawRow of allRows.slice(1)) {
      const row = rawRow as unknown[]
      const d = iOrderDate >= 0 ? parseDate(row[iOrderDate]) : ''
      if (d) dates.add(d)
    }
    for (const d of dates) {
      db.prepare(`DELETE FROM commit_sales WHERE order_date = ?`).run(d)
    }

    const stmt = db.prepare(`
      INSERT INTO commit_sales
        (order_id, order_date, status, customer, origin, subtotal, tax_discount, taxable_sub, tax, nontax_discount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let inserted = 0
    for (const rawRow of allRows.slice(1)) {
      const row = rawRow as unknown[]
      const orderId = iOrderId >= 0 ? String(row[iOrderId] ?? '').trim() : ''
      if (!orderId) continue
      stmt.run(
        orderId,
        iOrderDate  >= 0 ? parseDate(row[iOrderDate])          : '',
        iStatus     >= 0 ? String(row[iStatus] ?? '').trim()   : '',
        iCustomer   >= 0 ? String(row[iCustomer] ?? '').trim() : '',
        iOrigin     >= 0 ? String(row[iOrigin] ?? '').trim()   : '',
        iSubtotal   >= 0 ? parseNum(row[iSubtotal])            : 0,
        iTaxDisc    >= 0 ? parseNum(row[iTaxDisc])              : 0,
        iTaxSub     >= 0 ? parseNum(row[iTaxSub])               : 0,
        iTax        >= 0 ? parseNum(row[iTax])                  : 0,
        iNontaxDisc >= 0 ? parseNum(row[iNontaxDisc])           : 0,
        iTotal      >= 0 ? parseNum(row[iTotal])                : 0,
      )
      inserted++
    }

    return NextResponse.json({ ok: true, inserted })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET: query commit sales (merges summary + detail tables)
export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    ensureSchema(db)

    const summaryCount = (db.prepare(`SELECT COUNT(*) as c FROM commit_sales`).get() as { c: number }).c
    const detailCount  = (db.prepare(`SELECT COUNT(*) as c FROM commit_sales_detail`).get() as { c: number }).c

    const meta = {
      last_import: (db.prepare(`SELECT MAX(imported_at) as v FROM commit_sales`).get() as { v: string | null }).v,
      last_sync:   (db.prepare(`SELECT MAX(imported_at) as v FROM commit_sales_detail`).get() as { v: string | null }).v,
      summary_count: summaryCount,
      detail_count:  detailCount,
    }

    const url  = new URL(req.url)
    const mode = url.searchParams.get('mode')

    if (mode === 'today') {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      return NextResponse.json({ ...buildResponse(db, `order_date = '${today}'`), meta })
    }

    if (mode === 'bymonth') {
      // By-month uses detail table for source breakdown
      const byMonth = db.prepare(`
        SELECT substr(COALESCE(NULLIF(order_date,''), ''), 1, 7) AS month_key,
          COALESCE(NULLIF(source,''), '—') AS source,
          SUM(qty) AS qty, SUM(subtotal) AS revenue
        FROM commit_sales_detail WHERE month_key != ''
        GROUP BY month_key, source ORDER BY month_key DESC, revenue DESC
      `).all()

      // Fallback to summary if no detail data
      const byMonthSummary = db.prepare(`
        SELECT substr(COALESCE(NULLIF(order_date,''), ''), 1, 7) AS month_key,
          COALESCE(NULLIF(status,''), '—') AS status,
          COUNT(*) AS orders, SUM(subtotal) AS subtotal, SUM(total) AS total
        FROM commit_sales WHERE month_key != ''
        GROUP BY month_key, status ORDER BY month_key DESC, total DESC
      `).all()

      return NextResponse.json({ byMonth, byMonthSummary, meta })
    }

    // thismonth
    const now = new Date()
    const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return NextResponse.json({ ...buildResponse(db, `substr(COALESCE(NULLIF(order_date,''), ''), 1, 7) = '${ym}'`), meta })
  } catch (err) {
    return NextResponse.json({ bySource: [], byProduct: [], byState: [], byStatus: [], rows: [], totals: { orders: 0, subtotal: 0, total: 0, revenue: 0 }, error: String(err) }, { status: 500 })
  }
}

function buildResponse(db: ReturnType<typeof getDb>, whereClause: string) {
  // From detail table (synced from Finale pivot report — has source, product, state)
  const bySource = db.prepare(`
    SELECT COALESCE(NULLIF(source,''), '—') AS source,
      SUM(qty) AS qty, SUM(subtotal) AS revenue
    FROM commit_sales_detail WHERE ${whereClause}
    GROUP BY source ORDER BY revenue DESC
  `).all()

  const byProduct = db.prepare(`
    SELECT COALESCE(NULLIF(product_name,''), product_id, '—') AS product,
      product_id, SUM(qty) AS qty, SUM(subtotal) AS revenue
    FROM commit_sales_detail WHERE ${whereClause}
    GROUP BY product_id ORDER BY revenue DESC
  `).all()

  const byCategory = db.prepare(`
    SELECT COALESCE(NULLIF(category,''), '—') AS category,
      SUM(qty) AS qty, SUM(subtotal) AS revenue
    FROM commit_sales_detail WHERE ${whereClause}
    GROUP BY category ORDER BY revenue DESC
  `).all()

  const detailTotals = db.prepare(`
    SELECT COUNT(DISTINCT order_id) AS orders, SUM(subtotal) AS revenue
    FROM commit_sales_detail WHERE ${whereClause}
  `).get() as { orders: number; revenue: number }

  // From summary table (uploaded Excel — has status, subtotal/total)
  const byStatus = db.prepare(`
    SELECT COALESCE(NULLIF(status,''), '—') AS status,
      COUNT(*) AS orders, SUM(subtotal) AS subtotal, SUM(total) AS total
    FROM commit_sales WHERE ${whereClause}
    GROUP BY status ORDER BY total DESC
  `).all()

  const rows = db.prepare(`
    SELECT * FROM commit_sales WHERE ${whereClause}
    ORDER BY order_id
  `).all()

  const summaryTotals = db.prepare(`
    SELECT COUNT(*) AS orders, SUM(subtotal) AS subtotal, SUM(total) AS total
    FROM commit_sales WHERE ${whereClause}
  `).get() as { orders: number; subtotal: number; total: number }

  return {
    bySource, byProduct, byCategory, byStatus, rows,
    totals: {
      orders: (detailTotals.orders > 1 ? detailTotals.orders : 0) || summaryTotals.orders || 0,
      subtotal: summaryTotals.subtotal || 0,
      total: summaryTotals.total || 0,
      revenue: detailTotals.revenue || 0,
    }
  }
}
