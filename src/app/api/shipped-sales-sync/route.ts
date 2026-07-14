import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ACCOUNT      = 'deltamunchies'
const ATTR_NAME    = '%23%23user020'
const ROW_DIMS     = '~lJq3c2hpcG1lbnRPcmRlclNhbGVTb3VyY2XAzP7AwMDAwMDAms0Cz8DM_sDAwMDAwMCazQMbwMz-wMDAwMDAwJq1c2hpcG1lbnRPcmRlclN1YnRvdGFswMz-wMDAwMDAwA'
const REPORT_TITLE = 'Andy%20Custom%20Report%20-%20Shipped%20Sales%20By%20Source%20'

function buildFilters(monthOffset: number) {
  const filters = [
    ['shipmentOrderSaleSource', [], null],
    ['productCategory', null, null],
    ['shipmentOrderType', ['SALES_ORDER'], null],
    ['shipmentShipDate', { duration: 'month', offset: monthOffset, length: 1, timezone: 'America/Los_Angeles' }, null],
  ]
  return encodeURIComponent(Buffer.from(JSON.stringify(filters)).toString('base64'))
}

function getCredentials() {
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password  = process.env.FINALE_PASSWORD?.trim() || ''
  return Buffer.from(`${username}:${password}`).toString('base64')
}

async function generateReport(base64Auth: string, monthOffset = 0): Promise<string | null> {
  const ts  = Date.now()
  const url = `https://app.finaleinventory.com/${ACCOUNT}/doc/report/pivotTableStream/${ts}/Report.csv` +
    `?format=csv&data=shipmentItem&attrName=${ATTR_NAME}` +
    `&rowDimensions=${ROW_DIMS}` +
    `&filters=${buildFilters(monthOffset)}` +
    `&reportTitle=${REPORT_TITLE}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${base64Auth}`,
      Accept: 'text/html,application/xhtml+xml,*/*',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  })

  const text = await res.text()
  const jsRedirect = text.match(/window\.location\s*=\s*"([^"]+\/api\/content\/[^"]+)"/)
  if (jsRedirect) return `https://app.finaleinventory.com${jsRedirect[1]}`
  const contentMatch = text.match(/\/api\/content\/\d+\/file\/[^"'\s<>]+/)
  if (contentMatch) return `https://app.finaleinventory.com${contentMatch[0]}`
  if (res.url.includes('/api/content/')) return res.url
  return null
}

async function downloadCsv(csvUrl: string, base64Auth: string): Promise<string> {
  const sessionId = process.env.FINALE_SESSION_ID?.trim() ?? ''
  const csrfToken = process.env.FINALE_CSRF_TOKEN?.trim() ?? ''
  const res = await fetch(csvUrl, {
    headers: {
      Authorization: `Basic ${base64Auth}`,
      Cookie: `ACCOUNT=deltamunchies; JSESSIONID=${sessionId}; CSRFTOKEN=${csrfToken}`,
      Accept: 'text/csv,*/*',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`CSV download failed: ${res.status} — session cookie may have expired, update FINALE_SESSION_ID in .env.local`)
  return res.text()
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

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, '').replace(/\$/g, '')) || 0
}

function parseDate(s: string): string {
  if (!s) return ''
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  return s.split('T')[0]
}

interface CsvRow { source: string; orderId: string; shipDate: string; subtotal: number }

function parseCsvData(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers   = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim())
  const iSource   = headers.findIndex(h => h === 'source' || h === 'order source' || h === 'sale source')
  const iOrderId  = headers.findIndex(h => h === 'order id' || h === 'order_id' || h === 'orderid')
  const iShipDate = headers.findIndex(h => h === 'ship date' || h === 'ship_date' || h === 'shipdate')
  const iSubtotal = headers.findIndex(h => h === 'subtotal' || h === 'sub total')
  const rows: CsvRow[] = []
  for (const line of lines.slice(1)) {
    const vals     = splitCsvLine(line)
    const source   = iSource   >= 0 ? vals[iSource]             : ''
    const orderId  = iOrderId  >= 0 ? vals[iOrderId]            : ''
    const shipDate = iShipDate >= 0 ? parseDate(vals[iShipDate]): ''
    const subtotal = iSubtotal >= 0 ? parseNum(vals[iSubtotal]) : 0
    if (!source && !orderId) continue
    rows.push({ source: source || '—', orderId, shipDate, subtotal })
  }
  return rows
}

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipped_sales_csv (
      order_id TEXT NOT NULL, customer TEXT, order_date TEXT, ship_date TEXT,
      product_id TEXT, product_name TEXT, category TEXT,
      qty_shipped REAL NOT NULL DEFAULT 0, unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  try { db.exec(`ALTER TABLE shipped_sales_csv ADD COLUMN unit_price REAL DEFAULT 0`) } catch { /* exists */ }
}

const syncState = {
  status:    'idle' as 'idle' | 'syncing' | 'done' | 'error',
  count:     0,
  pages:     1,
  mode:      '' as string,
  progress:  '' as string,
  error:     null as string | null,
  syncedAt:  null as string | null,
}

// Fetch one month's report and upsert into DB (delete that month first)
async function syncMonth(base64Auth: string, monthOffset: number, db: ReturnType<typeof getDb>) {
  const csvUrl = await generateReport(base64Auth, monthOffset)
  if (!csvUrl) throw new Error(`Could not get CSV URL for month offset ${monthOffset}`)
  const csvText = await downloadCsv(csvUrl, base64Auth)
  const rows    = parseCsvData(csvText)

  // Delete existing records for this month using the date range
  // We derive the YYYY-MM prefix from the rows themselves, or from the offset
  const now   = new Date()
  const d     = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const ym    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  db.exec(`DELETE FROM shipped_sales_csv WHERE ship_date LIKE '${ym}%'`)

  const stmt = db.prepare(`
    INSERT INTO shipped_sales_csv (order_id, customer, order_date, ship_date, product_id, product_name, category, qty_shipped, unit_price, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const r of rows) stmt.run(r.orderId, r.source, '', r.shipDate, '', '', '', 0, 0, r.subtotal)
  return rows.length
}

async function runSync(historical: boolean) {
  syncState.status   = 'syncing'
  syncState.count    = 0
  syncState.pages    = 1
  syncState.mode     = historical ? 'historical' : 'report-export'
  syncState.progress = historical ? 'Starting historical sync…' : 'Fetching this month…'
  syncState.error    = null

  try {
    const base64Auth = getCredentials()
    const db = getDb()
    ensureSchema(db)

    if (historical) {
      // Jan 2026 → Jun 2026: calculate offsets relative to current month
      const now = new Date()
      const currentYear  = now.getFullYear()
      const currentMonth = now.getMonth() // 0-indexed

      let totalRows = 0
      // Build list of (year, month) pairs for Jan–Jun 2026
      const targets: { year: number; month: number; label: string }[] = []
      for (let m = 0; m <= 5; m++) { // Jan=0..Jun=5 in 2026
        const offset = (2026 - currentYear) * 12 + (m - currentMonth)
        targets.push({ year: 2026, month: m, label: new Date(2026, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) })
        targets[targets.length - 1] = { ...targets[targets.length - 1], offset } as typeof targets[0] & { offset: number }
      }

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i] as typeof targets[0] & { offset: number }
        syncState.progress = `Syncing ${t.label} (${i + 1}/${targets.length})…`
        const count = await syncMonth(base64Auth, t.offset, db)
        totalRows += count
        syncState.count = totalRows
        syncState.pages = i + 1
      }
    } else {
      // This month only
      const csvUrl = await generateReport(base64Auth, 0)
      if (!csvUrl) throw new Error('Could not get report CSV URL from Finale')
      const csvText = await downloadCsv(csvUrl, base64Auth)
      const rows    = parseCsvData(csvText)
      if (rows.length === 0) throw new Error('Report returned 0 rows')
      db.exec(`DELETE FROM shipped_sales_csv WHERE ship_date >= '${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}'`)
      db.exec(`DELETE FROM shipped_sales_csv WHERE ship_date = ''`)
      // For this month sync, clear all and re-insert (same as before)
      const now = new Date()
      const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      db.exec(`DELETE FROM shipped_sales_csv WHERE ship_date LIKE '${ym}%'`)
      const stmt = db.prepare(`
        INSERT INTO shipped_sales_csv (order_id, customer, order_date, ship_date, product_id, product_name, category, qty_shipped, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const r of rows) stmt.run(r.orderId, r.source, '', r.shipDate, '', '', '', 0, 0, r.subtotal)
      syncState.count = rows.length
    }

    syncState.status   = 'done'
    syncState.progress = ''
    syncState.syncedAt = new Date().toISOString()
  } catch (err) {
    syncState.status = 'error'
    syncState.error  = String(err)
  }
}

export async function GET() {
  return NextResponse.json(syncState)
}

export async function POST(req: Request) {
  if (syncState.status === 'syncing') return NextResponse.json({ started: false, reason: 'already syncing' })
  const body = await req.json().catch(() => ({})) as { historical?: boolean }
  runSync(body.historical === true).catch(() => {})
  return NextResponse.json({ started: true })
}
