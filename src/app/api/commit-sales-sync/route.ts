import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ACCOUNT      = 'deltamunchies'
// Report config from Finale "Sales order w/ detail" report
const ATTR_NAME    = '%23%23sale010'
const ROW_DIMS     = '~mpqvb3JkZXJTYWxlU291cmNlwMz-wMDAwMDAwJrM1cDLQGY5mZmZmZrAwMDAwMDAms0BBcDLQGY5mZmZmZrAwMDAwMDAmszEwADAwMDAwMDAms0BzcDLQGT0euFHrhTAwMDAwMDAms0B_sDLQHUdHrhR64XAwMDAwMDAms0B1MDLQITgKPXCj1zAwMDAwMDAmszIwMtAZPR64UeuFMDAwMDAwMCazMrAy0Bk9HrhR64UwMDAwMDAwJrM0cDLQGT0euFHrhTAwMDAwMDA'
const METRICS      = '~kZrNBaXAy0Bk9HrhR64UwMDAwMDAwA'
const REPORT_TITLE = 'Sales%20order%20w%2F%20detail'

function buildFilters(monthOffset: number) {
  return encodeURIComponent(Buffer.from(JSON.stringify([
    ['productProductUrl', null, null],
    ['productCategory', null, null],
    ['orderCustomer', null, null],
    ['orderOrderDate', { duration: 'month', offset: monthOffset, length: 1, timezone: 'America/Los_Angeles' }, null],
    ['orderOrigin', null, null],
    ['orderType', ['SALES_ORDER'], null],
    ['orderStatus', ['ORDER_COMPLETED', 'ORDER_CREATED', 'ORDER_LOCKED'], null],
    ['orderSaleSource', [], null],
  ])).toString('base64'))
}

function getCredentials() {
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password  = process.env.FINALE_PASSWORD?.trim() || ''
  return Buffer.from(`${username}:${password}`).toString('base64')
}

function getSessionCookies() {
  const sessionId = process.env.FINALE_SESSION_ID?.trim() ?? ''
  const csrfToken = process.env.FINALE_CSRF_TOKEN?.trim() ?? ''
  return `ACCOUNT=deltamunchies; JSESSIONID=${sessionId}; CSRFTOKEN=${csrfToken}`
}

async function generateReport(base64Auth: string, monthOffset = 0): Promise<string | null> {
  const ts  = Date.now()
  const url = `https://app.finaleinventory.com/${ACCOUNT}/doc/report/pivotTableStream/${ts}/Report.csv` +
    `?format=csv&data=orderItem&attrName=${ATTR_NAME}` +
    `&rowDimensions=${ROW_DIMS}` +
    `&metrics=${METRICS}` +
    `&filters=${buildFilters(monthOffset)}` +
    `&reportTitle=${REPORT_TITLE}` +
    `&disableGrouping=true`

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${base64Auth}`,
      Cookie: getSessionCookies(),
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
  const res = await fetch(csvUrl, {
    headers: {
      Authorization: `Basic ${base64Auth}`,
      Cookie: getSessionCookies(),
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

interface Row {
  source: string; orderId: string; orderDate: string; status: string; category: string
  productId: string; productName: string
  qty: number; unitPrice: number; subtotal: number
}

function parseCsvData(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim())
  const find = (...names: string[]) => names.map(n => headers.findIndex(h => h === n)).find(i => i >= 0) ?? -1

  const iSource   = find('source', 'order source', 'sale source')
  const iOrderId  = find('order id', 'order_id', 'orderid')
  const iDate     = find('order date', 'order_date')
  const iStatus   = find('status')
  const iCategory = find('category')
  const iProdId   = find('product id', 'product_id')
  const iProdName = find('description', 'product name')
  const iQty      = find('quantity', 'qty')
  const iPrice    = find('unit price', 'amount per unit')
  const iSubtotal = find('subtotal sum', 'subtotal', 'amount')

  const rows: Row[] = []
  for (const line of lines.slice(1)) {
    const v = splitCsvLine(line)
    rows.push({
      source:      iSource   >= 0 ? v[iSource]            : '',
      orderId:     iOrderId  >= 0 ? v[iOrderId]           : '',
      orderDate:   iDate     >= 0 ? parseDate(v[iDate])   : '',
      status:      iStatus   >= 0 ? v[iStatus]            : '',
      category:    iCategory >= 0 ? v[iCategory]          : '',
      productId:   iProdId   >= 0 ? v[iProdId]            : '',
      productName: iProdName >= 0 ? v[iProdName]          : '',
      qty:         iQty      >= 0 ? parseNum(v[iQty])     : 0,
      unitPrice:   iPrice    >= 0 ? parseNum(v[iPrice])   : 0,
      subtotal:    iSubtotal >= 0 ? parseNum(v[iSubtotal]): 0,
    })
  }
  return rows
}

function ensureSchema(db: ReturnType<typeof getDb>) {
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

const syncState = {
  status:      'idle' as 'idle' | 'syncing' | 'done' | 'error',
  count:       0,
  progress:    '' as string,
  error:       null as string | null,
  syncedAt:    null as string | null,
  csvHeaders:  null as string[] | null,
}

async function syncMonth(base64Auth: string, monthOffset: number, db: ReturnType<typeof getDb>) {
  const csvUrl = await generateReport(base64Auth, monthOffset)
  if (!csvUrl) throw new Error(`Could not get CSV URL for month offset ${monthOffset}`)
  const csvText = await downloadCsv(csvUrl, base64Auth)

  const firstLine = csvText.split(/\r?\n/)[0] ?? ''
  syncState.csvHeaders = splitCsvLine(firstLine)
  console.log('[commit-sales-sync] CSV headers:', JSON.stringify(syncState.csvHeaders))

  const rows = parseCsvData(csvText)

  const now = new Date()
  const d   = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  db.exec(`DELETE FROM commit_sales_detail WHERE order_date LIKE '${ym}%'`)

  const stmt = db.prepare(`
    INSERT INTO commit_sales_detail
      (order_id, order_date, source, status, category, product_id, product_name, qty, unit_price, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const r of rows) stmt.run(r.orderId, r.orderDate, r.source, r.status, r.category, r.productId, r.productName, r.qty, r.unitPrice, r.subtotal)
  return rows.length
}

async function runSync(historical: boolean) {
  syncState.status   = 'syncing'
  syncState.count    = 0
  syncState.progress = historical ? 'Starting historical sync…' : 'Fetching this month…'
  syncState.error    = null

  try {
    const base64Auth = getCredentials()
    const db = getDb()
    ensureSchema(db)

    if (historical) {
      const now = new Date()
      const currentYear  = now.getFullYear()
      const currentMonth = now.getMonth()
      let total = 0

      for (let m = 0; m <= 5; m++) {
        const offset = (2026 - currentYear) * 12 + (m - currentMonth)
        const label  = new Date(2026, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
        syncState.progress = `Syncing ${label} (${m + 1}/6)…`
        const count = await syncMonth(base64Auth, offset, db)
        total += count
        syncState.count = total
      }
    } else {
      const count = await syncMonth(base64Auth, 0, db)
      syncState.count = count
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
