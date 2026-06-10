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

  // Try inventorylevel first (has per-bin data)
  const invRes = await finaleGet('inventorylevel')
  if (invRes.status === 200 && Array.isArray(invRes.data) && (invRes.data as unknown[]).length > 0) {
    return importInventoryLevel(db, invRes.data as InventoryLevel[])
  }

  // Fallback: product endpoint (totals only, no per-bin breakdown)
  const prodRes = await finaleGet('product?limit=1000')
  if (prodRes.status !== 200) {
    return NextResponse.json({ error: `Finale API returned ${prodRes.status}. Check your credentials in Settings.` }, { status: 500 })
  }

  const products = Array.isArray(prodRes.data) ? prodRes.data : []
  if (products.length === 0) {
    return NextResponse.json({ error: 'No products returned from Finale API.' }, { status: 500 })
  }

  return importProducts(db, products as Product[])
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
}

function importInventoryLevel(db: ReturnType<typeof getDb>, rows: InventoryLevel[]) {
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
    ins.run(pid, bin, null, qoh)
    count++
  }
  const products = new Set(rows.map(r => r.productId || r.product_id).filter(Boolean)).size
  return NextResponse.json({ ok: true, source: 'inventorylevel', imported: count, products })
}

function importProducts(db: ReturnType<typeof getDb>, rows: Product[]) {
  db.prepare('DELETE FROM finale_stock_csv').run()
  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, qoh, imported_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)
  let count = 0
  for (const r of rows) {
    const pid = (r.productId || r.product_id || r.sku || '').trim()
    const name = (r.description || r.name || '').trim()
    const qoh = r.quantityOnHand ?? r.quantity_on_hand ?? r.stockQoh ?? r.qoh ?? 0
    if (!pid) continue
    ins.run(pid, '', name, qoh)
    count++
  }
  return NextResponse.json({ ok: true, source: 'product', imported: count, products: count, note: 'No per-bin breakdown — product totals only' })
}
