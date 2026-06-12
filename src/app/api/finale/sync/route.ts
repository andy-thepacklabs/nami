import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds

const COOLDOWN_MS = 60_000
let lastSyncAt = 0
let syncInProgress = false

function getCredentials() {
  const account  = process.env.FINALE_ACCOUNT?.trim() || ''
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password = process.env.FINALE_PASSWORD?.trim() || ''
  const apiAccount = account.split('/')[0]
  const base64 = Buffer.from(`${username}:${password}`).toString('base64')
  return { account: apiAccount, base64 }
}

async function finaleGet(path: string): Promise<{ status: number; data: unknown }> {
  const { account, base64 } = getCredentials()
  const url = `https://app.finaleinventory.com/${account}/api/${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${base64}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  let data: unknown = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

async function finaleGraphQL(query: string): Promise<unknown> {
  const { account, base64 } = getCredentials()
  const url = `https://app.finaleinventory.com/${account}/api/graphql`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
  return res.json()
}

// Parse sublocation summary string like "A1-01 (10), A1-02 (5)" or "A1-01:10, A1-02:5"
function parseSublocationSummary(summary: string | null | undefined): Array<{ bin: string; qty: number }> {
  if (!summary || typeof summary !== 'string') return []
  const result: Array<{ bin: string; qty: number }> = []

  // Try format: "BinName (qty)" — e.g. "A1-01 (10)"
  const parensPattern = /([^,()]+?)\s*\((\d+(?:\.\d+)?)\)/g
  let m: RegExpExecArray | null
  while ((m = parensPattern.exec(summary)) !== null) {
    const bin = m[1].trim()
    const qty = parseFloat(m[2])
    if (bin && !isNaN(qty) && qty > 0) result.push({ bin, qty })
  }
  if (result.length > 0) return result

  // Try format: "BinName:qty" — e.g. "A1-01:10"
  const colonPattern = /([^,:]+?)\s*:\s*(\d+(?:\.\d+)?)/g
  while ((m = colonPattern.exec(summary)) !== null) {
    const bin = m[1].trim()
    const qty = parseFloat(m[2])
    if (bin && !isNaN(qty) && qty > 0) result.push({ bin, qty })
  }
  return result
}

// GET: introspect Finale GraphQL product type fields
export async function GET(req: Request) {
  const { account } = getCredentials()
  if (!account) return NextResponse.json({ error: 'No credentials' }, { status: 400 })

  const url = new URL(req.url)
  // ?inspect=sublocation — find sublocation types in GraphQL schema
  if (url.searchParams.get('inspect') === 'sublocation') {
    try {
      // Search schema for sublocation/location related types
      const schemaRes = await finaleGraphQL(`{ __schema { types { name } } }`) as { data?: { __schema?: { types: Array<{ name: string }> } } }
      const allTypes = schemaRes.data?.__schema?.types?.map(t => t.name).filter(n => !n.startsWith('__')) ?? []
      const locationTypes = allTypes.filter(n => /subloc|location|bin|rack|shelf/i.test(n))
      // Also try introspecting known sublocation type names
      const results: Record<string, unknown> = { allLocationTypes: locationTypes }
      for (const t of ['sublocation', 'Sublocation', 'sublocationViewConnection', 'location', 'Location']) {
        const r = await finaleGraphQL(`{ __type(name: "${t}") { fields { name } } }`) as { data?: { __type?: { fields: Array<{ name: string }> } | null } }
        if (r.data?.__type) results[t] = r.data.__type.fields?.map(f => f.name)
      }
      return NextResponse.json(results)
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // ?inspect=salesorder — return raw field keys + first order's keys
  if (url.searchParams.get('inspect') === 'salesorder') {
    try {
      const typeNames = ['invoiceItem', 'orderItem', 'productViewConnectionSummaryMetric', 'invoiceItemViewConnectionSummaryMetric', 'orderItemViewConnectionSummaryMetric', 'product']
      const result: Record<string, string[]> = {}
      for (const t of typeNames) {
        const r = await finaleGraphQL(`{ __type(name: "${t}") { fields { name } } }`) as { data?: { __type?: { fields: Array<{ name: string }> } } }
        result[t] = r.data?.__type?.fields?.map(f => f.name) ?? []
      }
      return NextResponse.json(result)
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // ?inspect=product&id=MM-MPB — check what's stored in DB for a specific product
  const productId = url.searchParams.get('id')
  if (url.searchParams.get('inspect') === 'product' && productId) {
    try {
      const db = getDb()
      const stock = db.prepare(`SELECT * FROM finale_stock_csv WHERE product_id = ?`).all(productId)
      const sales = db.prepare(`SELECT * FROM finale_sales_csv WHERE product_id = ?`).get(productId)
      const consumed = db.prepare(`SELECT * FROM finale_consumed_90d WHERE product_id = ?`).get(productId)
      return NextResponse.json({ stock, sales, consumed })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // Default: GraphQL introspection
  try {
    const introspectQuery = `{ __type(name: "product") { fields { name } } }`
    const result = await finaleGraphQL(introspectQuery) as { data?: { __type?: { fields: Array<{ name: string }> } } }
    const fields = result.data?.__type?.fields?.map(f => f.name) ?? []
    return NextResponse.json({ fields })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

interface GqlProductNode {
  productId: string
  description: string
  category: string
  status: string
  unitsInStock: string | number | null
  stockAvailableToPromiseUnits: string | number | null
  stockSublocationSummary: string | null
  universalProductCode: string | null
  averageCost: number | null
  salesLast7Days: number | null
  salesLast30Days: number | null
  salesLast60Days: number | null
  salesLast90Days: number | null
  salesLastMonth: number | null
  salesThisMonth: number | null
}

export async function POST() {
  const { account } = getCredentials()
  if (!account) {
    return NextResponse.json({ error: 'Finale credentials not configured. Go to Settings first.' }, { status: 400 })
  }

  if (syncInProgress) {
    return NextResponse.json({ error: 'Sync already in progress. Please wait.' }, { status: 429 })
  }
  const now = Date.now()
  if (now - lastSyncAt < COOLDOWN_MS) {
    const secondsLeft = Math.ceil((COOLDOWN_MS - (now - lastSyncAt)) / 1000)
    return NextResponse.json({ error: `Please wait ${secondsLeft}s before syncing again.` }, { status: 429 })
  }
  syncInProgress = true
  lastSyncAt = now

  try {
    return await doSync()
  } finally {
    syncInProgress = false
  }
}

function loadActiveLocationsFromDb(): Set<string> {
  const db = getDb()
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS active_locations (bin_location TEXT PRIMARY KEY, imported_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    const rows = db.prepare(`SELECT bin_location FROM active_locations`).all() as { bin_location: string }[]
    return new Set(rows.map(r => r.bin_location))
  } catch {
    return new Set()
  }
}

async function fetchConsumed90d(): Promise<Map<string, number>> {
  const consumed = new Map<string, number>()
  try {
    const weRes = await finaleGet('workeffort')
    if (weRes.status !== 200) return consumed
    const weData = weRes.data as Record<string, unknown[]>

    const workEffortIds  = (weData.workEffortId  || []) as string[]
    const statusIds      = (weData.statusId      || []) as string[]
    const completeDates  = (weData.completeDate  || []) as (string | null)[]
    const consumeLists   = (weData.workEffortConsumeList || []) as (unknown[] | null)[]

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = cutoff.toISOString().split('T')[0] // "YYYY-MM-DD"

    for (let i = 0; i < workEffortIds.length; i++) {
      const status = (statusIds[i] || '').toUpperCase()
      if (!status.includes('COMPLETE')) continue
      const cd = completeDates[i]
      if (!cd || cd < cutoffStr) continue

      const list = consumeLists[i]
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const ci = item as { productId?: string; quantity?: number }
        const pid = (ci.productId || '').trim()
        if (!pid || !ci.quantity) continue
        consumed.set(pid, (consumed.get(pid) || 0) + (ci.quantity || 0))
      }
    }
  } catch (err) {
    console.warn('[sync] fetchConsumed90d failed:', err)
  }
  return consumed
}


async function doSync(): Promise<ReturnType<typeof NextResponse.json>> {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_stock_csv (
      product_id   TEXT NOT NULL,
      bin_location TEXT NOT NULL DEFAULT '',
      product_name TEXT,
      category     TEXT,
      qoh          REAL NOT NULL DEFAULT 0,
      available    REAL,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, bin_location)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_consumed_90d (
      product_id TEXT PRIMARY KEY,
      quantity   REAL NOT NULL DEFAULT 0,
      synced_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_sales_csv (
      product_id        TEXT PRIMARY KEY,
      product_name      TEXT,
      category          TEXT,
      sales_7d          REAL,
      sales_30d         REAL,
      sales_60d         REAL,
      sales_90d         REAL,
      sales_last_month  REAL,
      sales_this_month  REAL,
      qty_on_hand       REAL,
      qty_available     REAL,
      average_cost      REAL,
      upc               TEXT,
      imported_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  try { db.exec(`ALTER TABLE finale_stock_csv ADD COLUMN category TEXT`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE finale_stock_csv ADD COLUMN available REAL`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE finale_sales_csv ADD COLUMN sales_60d REAL`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE finale_sales_csv DROP COLUMN sales_180d`) } catch { /* already removed */ }
  try { db.exec(`ALTER TABLE finale_sales_csv ADD COLUMN qty_on_hand REAL`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE finale_sales_csv ADD COLUMN qty_available REAL`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE finale_sales_csv ADD COLUMN average_cost REAL`) } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE finale_sales_csv ADD COLUMN upc TEXT`) } catch { /* already exists */ }

  // --- Try GraphQL path first ---
  // Active-only filter reduces pages fetched (skips ~1014 inactive products)
  // Strategy: try combined stock+sales in one pass; if sales fields unsupported, retry stock-only
  type FullNode = {
    productId: string; description: string; category: string; status: string
    unitsInStock: string | number | null; stockAvailableToPromiseUnits: string | number | null
    stockSublocationSummary: string | null; universalProductCode: string | null
    averageCost: number | null; salesLast7Days: number | null; salesLast30Days: number | null
    salesLast60Days: number | null; salesLast90Days: number | null
    salesLastMonth: number | null; salesThisMonth: number | null
  }

  async function fetchAllPages(fields: string, statusFilter: string): Promise<FullNode[]> {
    const nodes: FullNode[] = []
    let hasNextPage = true
    let cursor: string | null = null
    while (hasNextPage) {
      if (cursor) await new Promise(r => setTimeout(r, 600))
      const args = [`first: 500`, statusFilter, cursor ? `after: "${cursor}"` : ''].filter(Boolean).join(', ')
      const query = `{ productViewConnection(${args}) { pageInfo { hasNextPage endCursor } edges { node { ${fields} } } } }`
      const result = await finaleGraphQL(query) as { data?: { productViewConnection?: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: Array<{ node: FullNode }> } }; errors?: Array<{ message: string }> }
      if (result.errors?.length) throw new Error(result.errors[0].message)
      const conn = result.data?.productViewConnection
      if (!conn) throw new Error('No productViewConnection in GraphQL response')
      for (const edge of conn.edges) nodes.push(edge.node)
      hasNextPage = conn.pageInfo.hasNextPage
      cursor = conn.pageInfo.endCursor
    }
    return nodes
  }

  const STOCK_FIELDS = 'productId description category status unitsInStock stockAvailableToPromiseUnits stockSublocationSummary'
  const SALES_FIELDS = 'universalProductCode averageCost salesLast7Days salesLast30Days salesLast60Days salesLast90Days salesLastMonth salesThisMonth'
  // Try active-only filter first; fall back to no filter if unsupported
  const STATUS_FILTER = 'filter: { statusId: { eq: "PRODUCT_ACTIVE" } }'

  let allProducts: FullNode[] = []
  let hasSalesData = false
  let usedStatusFilter = false
  let gqlErrorNote = ''

  // Attempt 1: combined fields + active filter (fewest API calls)
  for (const [fields, statusArg, label] of [
    [`${STOCK_FIELDS} ${SALES_FIELDS}`, STATUS_FILTER, 'combined+filter'],
    [`${STOCK_FIELDS} ${SALES_FIELDS}`, '',             'combined'],
    [`${STOCK_FIELDS}`,                 STATUS_FILTER, 'stock+filter'],
    [`${STOCK_FIELDS}`,                 '',             'stock'],
  ] as [string, string, string][]) {
    try {
      allProducts = await fetchAllPages(fields, statusArg)
      hasSalesData = fields.includes('salesLast7Days')
      usedStatusFilter = statusArg !== ''
      console.log(`[sync] GraphQL OK via ${label}, got ${allProducts.length} products`)
      break
    } catch (err) {
      console.warn(`[sync] GraphQL ${label} failed:`, err instanceof Error ? err.message : err)
      gqlErrorNote = err instanceof Error ? err.message : String(err)
      allProducts = []
    }
  }

  if (allProducts.length > 0) {
    // Filter inactive client-side (in case status filter wasn't used)
    let skipped = 0
    const activeProducts = usedStatusFilter ? allProducts : allProducts.filter(p => {
      const s = (p.status || '').toUpperCase()
      if (s === 'PRODUCT_INACTIVE' || s === 'INACTIVE') { skipped++; return false }
      return true
    })

    if (activeProducts.length === 0) {
      return NextResponse.json({ error: 'No active products found in Finale.' }, { status: 500 })
    }
    if (usedStatusFilter) skipped = 0 // server already filtered

    const hasSublocs = activeProducts.some(p => p.stockSublocationSummary && p.stockSublocationSummary.trim() !== '')

    // Load active bin whitelist from DB (uploaded via CSV import)
    const activeBins = loadActiveLocationsFromDb()
    const filterBin = (bin: string) => activeBins.size > 0 ? activeBins.has(bin) : bin.startsWith('SFS-')

    db.prepare('DELETE FROM finale_stock_csv').run()
    const ins = db.prepare(`
      INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, category, qoh, available, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    let imported = 0
    db.exec('BEGIN')
    try {
      for (const p of activeProducts) {
        const pid       = (p.productId || '').trim()
        const name      = (p.description || '').trim()
        const cat       = (p.category || '').trim()
        const available = parseFloat(String(p.stockAvailableToPromiseUnits ?? '0').replace(/,/g, '')) || 0
        if (!pid) continue
        if (hasSublocs && p.stockSublocationSummary) {
          const bins = parseSublocationSummary(p.stockSublocationSummary)
            .filter(b => filterBin(b.bin))
          if (bins.length > 0) {
            for (const { bin, qty } of bins) { ins.run(pid, bin, name, cat, qty, available); imported++ }
            continue
          }
        }
        // No matching bins — store as product total with no bin location
        const qoh = parseFloat(String(p.unitsInStock ?? '0')) || 0
        ins.run(pid, '', name, cat, qoh, available)
        imported++
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      return NextResponse.json({ error: `Stock insert failed: ${e}` }, { status: 500 })
    }

    // Consumed 90d
    const consumed = await fetchConsumed90d()
    if (consumed.size > 0) {
      const insC = db.prepare(`INSERT OR REPLACE INTO finale_consumed_90d (product_id, quantity, synced_at) VALUES (?, ?, datetime('now'))`)
      db.prepare('DELETE FROM finale_consumed_90d').run()
      db.exec('BEGIN')
      try { for (const [pid, qty] of consumed) insC.run(pid, qty); db.exec('COMMIT') }
      catch (e) { db.exec('ROLLBACK'); console.warn('[sync] Failed to save consumed data:', e) }
    }

    // Save sales data if we got it in the same query
    let salesSynced = 0
    if (hasSalesData) {
      const insSales = db.prepare(`
        INSERT OR REPLACE INTO finale_sales_csv
          (product_id, product_name, category, sales_7d, sales_30d, sales_60d, sales_90d,
           sales_last_month, sales_this_month, qty_on_hand, qty_available, average_cost, upc, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      db.prepare('DELETE FROM finale_sales_csv').run()
      const parseSalesNum = (v: unknown) => {
        if (v == null) return null
        const n = parseFloat(String(v).replace(/,/g, ''))
        return isNaN(n) ? null : n
      }
      db.exec('BEGIN')
      try {
        for (const p of activeProducts) {
          const pid = (p.productId || '').trim()
          if (!pid) continue
          insSales.run(pid, (p.description||'').trim()||null, (p.category||'').trim()||null, parseSalesNum(p.salesLast7Days), parseSalesNum(p.salesLast30Days), parseSalesNum(p.salesLast60Days), parseSalesNum(p.salesLast90Days), parseSalesNum(p.salesLastMonth), parseSalesNum(p.salesThisMonth), parseFloat(String(p.unitsInStock??'0'))||null, parseFloat(String(p.stockAvailableToPromiseUnits??'0'))||null, p.averageCost??null, p.universalProductCode??null)
          salesSynced++
        }
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK'); console.warn('[sync] Failed to save sales data:', e) }
    }

    const salesNote = hasSalesData ? '' : ` · Sales skipped: ${gqlErrorNote}`
    return NextResponse.json({
      ok: true,
      source: 'graphql',
      products: activeProducts.length,
      imported,
      skipped,
      consumed: consumed.size,
      salesSynced,
      note: (hasSublocs ? `QoH & sublocations synced ✓` : `QoH synced ✓ — no sublocation data`) + salesNote,
    })
  }

  // --- Fallback: REST product API (category + product names only, QoH=0) ---
  const prodRes = await finaleGet('product?limit=5000')
  if (prodRes.status !== 200) {
    return NextResponse.json({ error: `Finale API returned ${prodRes.status}. Check your credentials.` }, { status: 500 })
  }

  const raw = prodRes.data as Record<string, unknown[]>
  const productIds   = (raw.productId    || []) as string[]
  const productNames = (raw.internalName || raw.description || raw.name || []) as string[]
  const statusIds    = (raw.statusId     || raw.status || []) as string[]
  const categories   = (raw.category     || []) as string[]

  const productMap = new Map<string, { name: string; category: string }>()
  let skipped = 0
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i]?.trim()
    if (!pid) continue
    const status = (statusIds[i] || '').toString().toUpperCase()
    if (status === 'PRODUCT_INACTIVE' || status === 'INACTIVE') { skipped++; continue }
    productMap.set(pid, { name: productNames[i] || '', category: categories[i] || '' })
  }

  if (productMap.size === 0) {
    return NextResponse.json({ error: 'No active products found in Finale.' }, { status: 500 })
  }

  db.prepare('DELETE FROM finale_stock_csv').run()
  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, category, qoh, imported_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `)
  for (const [pid, { name, category }] of productMap) {
    ins.run(pid, '', name, category)
  }
  return NextResponse.json({
    ok: true,
    source: 'rest-fallback',
    products: productMap.size,
    imported: productMap.size,
    skipped,
    note: `Category synced ✓ — GraphQL error: ${(globalThis as Record<string, unknown>).__lastGqlError ?? 'unknown'}`,
  })
}
