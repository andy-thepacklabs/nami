import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

// GET: inspect raw Finale field names (for debugging)
export async function GET() {
  const { account } = getCredentials()
  if (!account) return NextResponse.json({ error: 'No credentials' }, { status: 400 })
  const res = await finaleGet('product?limit=2')
  const raw = res.data as Record<string, unknown>
  const fields = raw && typeof raw === 'object' ? Object.keys(raw) : []
  // Show first row values for each field
  const sample: Record<string, unknown> = {}
  for (const f of fields) {
    const arr = raw[f]
    sample[f] = Array.isArray(arr) ? arr[0] : arr
  }
  return NextResponse.json({ status: res.status, fields, sample })
}

export async function POST() {
  const { account } = getCredentials()
  if (!account) {
    return NextResponse.json({ error: 'Finale credentials not configured. Go to Settings first.' }, { status: 400 })
  }

  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_stock_csv (
      product_id   TEXT NOT NULL,
      bin_location TEXT NOT NULL DEFAULT '',
      product_name TEXT,
      qoh          REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, bin_location)
    )
  `)

  // Step 1: Fetch all ACTIVE products (productId + internalName + statusId)
  const prodRes = await finaleGet('product?limit=2000')
  if (prodRes.status !== 200) {
    return NextResponse.json({ error: `Finale API returned ${prodRes.status}. Check your credentials.` }, { status: 500 })
  }

  const raw = prodRes.data as Record<string, unknown[]>
  const productIds   = (raw.productId     || []) as string[]
  const productNames = (raw.internalName  || raw.description || raw.name || []) as string[]
  const statusIds    = (raw.statusId      || raw.status || []) as string[]

  // Build active product name map
  const nameMap = new Map<string, string>()
  let skipped = 0
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i]?.trim()
    if (!pid) continue
    const status = (statusIds[i] || '').toString().toUpperCase()
    if (status === 'PRODUCT_INACTIVE' || status === 'INACTIVE') { skipped++; continue }
    nameMap.set(pid, productNames[i] || '')
  }

  if (nameMap.size === 0) {
    return NextResponse.json({ error: 'No active products found in Finale.' }, { status: 500 })
  }

  // Step 2: Try inventorylevel for per-bin QoH
  const invRes = await finaleGet('inventorylevel')
  if (invRes.status === 200 && invRes.data) {
    const invRaw = invRes.data as Record<string, unknown[]>
    let invRows: InventoryLevel[] = []

    if (Array.isArray(invRes.data)) {
      invRows = invRes.data as InventoryLevel[]
    } else if (invRaw && Array.isArray(invRaw.productId)) {
      const ids  = invRaw.productId as string[]
      const bins = (invRaw.subLocation || invRaw.sublocation || invRaw.binLocation || invRaw.locationId || []) as string[]
      const qohs = (invRaw.quantityOnHand || invRaw.qtyOnHand || invRaw.qoh || invRaw.quantity || []) as number[]
      invRows = ids.map((pid, i) => ({
        productId: pid,
        subLocation: bins[i] || '',
        quantityOnHand: Number(qohs[i]) || 0,
      }))
    }

    // Filter to active products only and import
    const activeRows = invRows.filter(r => {
      const pid = (r.productId || r.product_id || '').trim()
      return nameMap.has(pid)
    })

    if (activeRows.length > 0) {
      return importInventoryLevel(db, activeRows, nameMap, skipped)
    }
  }

  // Step 3: inventorylevel not available — import products with QoH=0 as placeholders
  // QoH data requires a Finale CSV export upload
  db.prepare('DELETE FROM finale_stock_csv').run()
  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, qoh, imported_at)
    VALUES (?, ?, ?, 0, datetime('now'))
  `)
  for (const [pid, name] of nameMap) {
    ins.run(pid, '', name)
  }
  return NextResponse.json({
    ok: true,
    source: 'product-api',
    products: nameMap.size,
    imported: nameMap.size,
    skipped,
    note: 'QoH not available via API — upload a Finale CSV export to add stock quantities',
  })
}

interface InventoryLevel {
  productId?: string; product_id?: string
  subLocation?: string; sub_location?: string; binLocation?: string
  quantityOnHand?: number; quantity_on_hand?: number; qoh?: number
}

interface Product {
  productId?: string; product_id?: string; sku?: string
  description?: string; name?: string
  quantityOnHand?: number; quantity_on_hand?: number; qoh?: number; stockQoh?: number
  active?: unknown; status?: unknown; productStatus?: unknown; enabled?: unknown
}

function importInventoryLevel(
  db: ReturnType<typeof getDb>,
  rows: InventoryLevel[],
  nameMap: Map<string, string>,
  skipped: number
) {
  db.prepare('DELETE FROM finale_stock_csv').run()
  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, qoh, imported_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)
  let count = 0
  for (const r of rows) {
    const pid = (r.productId || r.product_id || '').trim()
    const bin = (r.subLocation || r.sub_location || r.binLocation || '').trim()
    const qoh = r.quantityOnHand ?? r.quantity_on_hand ?? r.qoh ?? 0
    if (!pid || qoh <= 0) continue
    const name = nameMap.get(pid) || ''
    ins.run(pid, bin, name, qoh)
    count++
  }
  const products = new Set(rows.map(r => r.productId || r.product_id).filter(Boolean)).size
  return NextResponse.json({ ok: true, source: 'inventorylevel', imported: count, products, skipped })
}

function isActive(r: Product): boolean {
  const val = r.active ?? r.status ?? r.productStatus ?? r.enabled
  if (val === undefined || val === null) return true // no status field = assume active
  if (typeof val === 'boolean') return val
  const s = String(val).toLowerCase().trim()
  // Treat these as inactive
  return !['false', '0', 'inactive', 'disabled', 'no', 'n'].includes(s)
}

function importProducts(db: ReturnType<typeof getDb>, rows: Product[]) {
  db.prepare('DELETE FROM finale_stock_csv').run()
  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, qoh, imported_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)
  let count = 0
  let skipped = 0
  for (const r of rows) {
    const pid = (r.productId || r.product_id || r.sku || '').trim()
    const name = (r.description || r.name || '').trim()
    const qoh = r.quantityOnHand ?? r.quantity_on_hand ?? r.stockQoh ?? r.qoh ?? 0
    if (!pid) continue
    if (!isActive(r)) { skipped++; continue }
    ins.run(pid, '', name, qoh)
    count++
  }
  return NextResponse.json({ ok: true, source: 'product', imported: count, products: count, skipped, note: 'No per-bin breakdown — product totals only' })
}
