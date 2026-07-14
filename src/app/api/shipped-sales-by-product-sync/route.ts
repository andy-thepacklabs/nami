import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ACCOUNT      = 'deltamunchies'
const ATTR_NAME    = '%23%23user029'
const ROW_DIMS     = '~l5q3c2hpcG1lbnRPcmRlclNhbGVTb3VyY2XAzP7AwMDAwMDAms0Cz8DM_sDAwMDAwMCazQMbwMz-wMDAwMDAwJrNAf7AzP7AwMDAwMDAms0B1MDM_sDAwMDAwMCazQKtwMz-wMDAwMDAwJq5c2hpcG1lbnRTaGlwVG9TdGF0ZVJlZ2lvbsDM_sDAwMDAwMA'
const METRICS      = '~k5rZJnNoaXBtZW50SXRlbVN1YlRvdGFsUGVyVW5pdENvbnNvbGlkYXRlwMz-wMDAwMDAwJq_c2hpcG1lbnRJdGVtU3ViVG90YWxDb25zb2xpZGF0ZcDM_sDAwMDAwMCa2SBzaGlwbWVudE9yZGVyU3VidG90YWxDb25zb2xpZGF0ZcDM_sDAwMDAwMA'
const REPORT_TITLE = 'Andy%20Custom%20Report%20-%20Shipped%20Sales'

function buildFilters(monthOffset: number) {
  const filters = [
    ['shipmentType', ['SALES_SHIPMENT'], null],
    ['shipmentShipDate', { duration: 'month', offset: monthOffset, length: 1, timezone: 'America/Los_Angeles' }, null],
    ['shipmentOrderOrderUrl', null, null],
    ['shipmentOrderSaleSource', [], null],
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
    `&metrics=${METRICS}` +
    `&filters=${buildFilters(monthOffset)}` +
    `&reportTitle=${REPORT_TITLE}` +
    `&disableGrouping=true`

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

interface ProductRow {
  source: string; orderId: string; shipDate: string
  productId: string; productName: string
  qty: number; unitPrice: number; amount: number; subtotal: number
}

function parseCsvData(text: string): ProductRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim())
  const find = (...names: string[]) => names.map(n => headers.findIndex(h => h === n)).find(i => i >= 0) ?? -1

  const iSource   = find('source', 'order source')
  const iOrderId  = find('order id', 'order_id')
  const iShipDate = find('ship date', 'ship_date')
  const iProdId   = find('product id', 'product_id')
  const iProdName = find('description', 'product name', 'product_name')
  const iQty      = find('quantity', 'qty shipped', 'qty')
  const iPrice    = find('amount per unit', 'unit price')
  const iAmount   = find('amount')
  const iSubtotal = find('subtotal', 'total')

  const rows: ProductRow[] = []
  for (const line of lines.slice(1)) {
    const v = splitCsvLine(line)
    const productId = iProdId >= 0 ? v[iProdId] : ''
    if (!productId) continue
    rows.push({
      source:      iSource   >= 0 ? v[iSource]            : '',
      orderId:     iOrderId  >= 0 ? v[iOrderId]           : '',
      shipDate:    iShipDate >= 0 ? parseDate(v[iShipDate]): '',
      productId,
      productName: iProdName >= 0 ? v[iProdName]          : '',
      qty:         iQty      >= 0 ? parseNum(v[iQty])     : 0,
      unitPrice:   iPrice    >= 0 ? parseNum(v[iPrice])   : 0,
      amount:      iAmount   >= 0 ? parseNum(v[iAmount])  : 0,
      subtotal:    iSubtotal >= 0 ? parseNum(v[iSubtotal]) : 0,
    })
  }
  return rows
}

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipped_sales_by_product (
      order_id TEXT, product_id TEXT, product_name TEXT, source TEXT,
      ship_date TEXT, qty_shipped REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  try { db.exec(`ALTER TABLE shipped_sales_by_product ADD COLUMN amount REAL NOT NULL DEFAULT 0`) } catch {}
}

const syncState = {
  status:   'idle' as 'idle' | 'syncing' | 'done' | 'error',
  count:    0,
  progress: '' as string,
  error:    null as string | null,
  syncedAt: null as string | null,
}

async function syncMonth(base64Auth: string, monthOffset: number, db: ReturnType<typeof getDb>) {
  const csvUrl = await generateReport(base64Auth, monthOffset)
  if (!csvUrl) throw new Error(`Could not get CSV URL for month offset ${monthOffset}`)
  const csvText = await downloadCsv(csvUrl, base64Auth)
  const rows    = parseCsvData(csvText)

  const now = new Date()
  const d   = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const ym  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  db.exec(`DELETE FROM shipped_sales_by_product WHERE ship_date LIKE '${ym}%'`)

  const stmt = db.prepare(`
    INSERT INTO shipped_sales_by_product
      (order_id, product_id, product_name, source, ship_date, qty_shipped, unit_price, amount, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const r of rows) stmt.run(r.orderId, r.productId, r.productName, r.source, r.shipDate, r.qty, r.unitPrice, r.amount, r.subtotal)
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

      for (let m = 0; m <= 5; m++) { // Jan–Jun 2026
        const offset = (2026 - currentYear) * 12 + (m - currentMonth)
        const label  = new Date(2026, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
        syncState.progress = `Syncing ${label} (${m + 1}/6)…`
        const count = await syncMonth(base64Auth, offset, db)
        total += count
        syncState.count = total
      }
    } else {
      // This month only
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
