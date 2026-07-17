import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getCredentials() {
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password  = process.env.FINALE_PASSWORD?.trim() || ''
  const account   = (process.env.FINALE_ACCOUNT?.trim() || '').split('/')[0]
  const base64    = Buffer.from(`${username}:${password}`).toString('base64')
  return { account, base64 }
}

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bom_products (
      product_id      TEXT PRIMARY KEY,
      product_name    TEXT,
      status_id       TEXT,
      expand_policy   TEXT,
      bom_child_count INTEGER NOT NULL DEFAULT 0,
      synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bom_entries (
      parent_id TEXT,
      child_id  TEXT,
      bom_qty   REAL NOT NULL DEFAULT 1,
      PRIMARY KEY (parent_id, child_id)
    )
  `)
}

const syncState = {
  status:   'idle' as 'idle' | 'syncing' | 'done' | 'error',
  progress: '' as string,
  count:    0,
  error:    null as string | null,
  syncedAt: null as string | null,
  summary:  null as { expand: number; noexpand: number; blank: number; total: number } | null,
}

type FinaleAssocItem = { productId: string; quantity: number }
type FinaleAssoc = { productAssocTypeId: string; productAssocItemList: FinaleAssocItem[] }

async function runSync() {
  const { account, base64 } = getCredentials()
  const db = getDb()
  ensureSchema(db)

  const headers = { Authorization: `Basic ${base64}`, Accept: 'application/json' }
  const limit = 500
  let offset = 0
  let pageNum = 0

  const stats = { expand: 0, noexpand: 0, blank: 0, total: 0 }

  const upsertProduct = db.prepare(`
    INSERT INTO bom_products (product_id, product_name, status_id, expand_policy, bom_child_count, synced_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(product_id) DO UPDATE SET
      product_name    = excluded.product_name,
      status_id       = excluded.status_id,
      expand_policy   = excluded.expand_policy,
      bom_child_count = excluded.bom_child_count,
      synced_at       = excluded.synced_at
  `)

  const deleteBomChildren = db.prepare(`DELETE FROM bom_entries WHERE parent_id = ?`)
  const insertBomEntry = db.prepare(`
    INSERT OR REPLACE INTO bom_entries (parent_id, child_id, bom_qty) VALUES (?, ?, ?)
  `)

  // Only FINISHED_GOOD products have BOMs — this keeps the sync to ~31 pages (~15,500 products)
  // Finale wraps offset back to 0 past the end, so we also track the first ID of each page
  // to detect loops and break early.
  const seenFirstIds = new Set<string>()

  while (true) {
    const url = `https://app.finaleinventory.com/${account}/api/product?limit=${limit}&offset=${offset}&productTypeId=FINISHED_GOOD`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Finale API HTTP ${res.status} at offset ${offset}`)
    const d = await res.json()

    const ids: string[]         = d.productId ?? []
    const names: string[]       = d.internalName ?? []
    const statuses: string[]    = d.statusId ?? []
    const policies: string[]    = d.expandBillOfMaterialsPolicy ?? []
    const assocLists: FinaleAssoc[][] = d.productAssocList ?? []

    if (!ids.length) break
    // Loop detection: if we've seen this first ID before, Finale wrapped around
    if (seenFirstIds.has(ids[0])) break
    seenFirstIds.add(ids[0])

    pageNum++
    syncState.progress = `Syncing page ${pageNum} (${stats.total + ids.length} products)…`

    db.exec('BEGIN')
    try {
      for (let i = 0; i < ids.length; i++) {
        const pid    = ids[i]
        const policy = policies[i] || ''
        const assocs = assocLists[i] ?? []
        const children: FinaleAssocItem[] = assocs
          .filter((a: FinaleAssoc) => a.productAssocTypeId === 'MANUF_COMPONENT')
          .flatMap((a: FinaleAssoc) => a.productAssocItemList ?? [])

        upsertProduct.run(pid, names[i] ?? '', statuses[i] ?? '', policy, children.length)

        if (children.length > 0) {
          deleteBomChildren.run(pid)
          for (const c of children) {
            insertBomEntry.run(pid, c.productId, c.quantity ?? 1)
          }
        }

        stats.total++
        if (policy === '##expand') stats.expand++
        else if (policy === '##noexpand') stats.noexpand++
        else stats.blank++
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    if (ids.length < limit) break
    offset += limit
  }

  return stats
}

async function doSync() {
  syncState.status   = 'syncing'
  syncState.count    = 0
  syncState.progress = 'Starting sync…'
  syncState.error    = null
  syncState.summary  = null

  try {
    const stats = await runSync()
    syncState.status   = 'done'
    syncState.count    = stats.total
    syncState.progress = ''
    syncState.syncedAt = new Date().toISOString()
    syncState.summary  = stats
  } catch (err) {
    syncState.status = 'error'
    syncState.error  = String(err)
  }
}

export async function GET() {
  return NextResponse.json(syncState)
}

export async function POST() {
  if (syncState.status === 'syncing') return NextResponse.json({ started: false, reason: 'already syncing' })
  doSync().catch(() => {})
  return NextResponse.json({ started: true })
}
