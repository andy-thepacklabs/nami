import { NextResponse } from 'next/server'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DB_PATH = path.join(process.cwd(), 'inventory.db')

// In-memory sync state (shared across requests in the same Node process)
const syncState = {
  status: 'idle' as 'idle' | 'syncing' | 'done' | 'error',
  page: 0,
  total: 0,
  syncedAt: null as string | null,
  error: null as string | null,
}

function getDb() {
  const db = new DatabaseSync(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS builds_cache (
      build_id TEXT PRIMARY KEY,
      status TEXT,
      validation TEXT,
      product_id TEXT,
      product_name TEXT,
      qty_to_produce REAL,
      start_date TEXT,
      complete_date_actual TEXT,
      complete_date TEXT,
      effective_date TEXT,
      completed_by TEXT
    );
    CREATE TABLE IF NOT EXISTS builds_sync_meta (
      id INTEGER PRIMARY KEY,
      synced_at TEXT,
      last_cursor TEXT
    );
  `)
  // Migrations
  try { db.exec('ALTER TABLE builds_sync_meta ADD COLUMN last_cursor TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE builds_cache ADD COLUMN completed_by TEXT') } catch { /* already exists */ }
  db.exec(`
  `)
  return db
}

function parseNum(v: unknown): number {
  return parseFloat(String(v ?? '').replace(/,/g, '')) || 0
}

function parseFinaleDate(s: string): string {
  if (!s) return ''
  const clean = s.replace(/\s*\(est\)/i, '').trim()
  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  const d = new Date(clean)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

function getCredentials() {
  const account  = process.env.FINALE_ACCOUNT?.trim() || ''
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password = process.env.FINALE_PASSWORD?.trim() || ''
  return { account, base64: Buffer.from(`${username}:${password}`).toString('base64') }
}

async function runSync() {
  const { account, base64 } = getCredentials()
  const FIELDS = `buildId status validation quantityToProduce startDate startDateActual completeDate completeDateActual recordLastUpdated completeTransactionUser { name } productToProduce { productId description }`

  syncState.status = 'syncing'
  syncState.page = 0
  syncState.total = 0
  syncState.error = null

  try {
    const db = getDb()

    // Load last cursor — if present, only fetch NEW builds since last sync
    const meta = db.prepare('SELECT synced_at, last_cursor FROM builds_sync_meta WHERE id = 1').get() as
      { synced_at: string; last_cursor: string | null } | undefined
    const isIncremental = !!meta?.last_cursor
    let after: string | null = meta?.last_cursor ?? null

    const insert = db.prepare(`
      INSERT OR REPLACE INTO builds_cache
        (build_id, status, validation, product_id, product_name, qty_to_produce, start_date, complete_date_actual, complete_date, effective_date, completed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // On full sync (first time), clear the cache
    if (!isIncremental) db.exec('DELETE FROM builds_cache')

    let lastCursor: string | null = after
    let newBuilds = 0

    do {
      const cursor = after ? `, after: "${after}"` : ''
      const res = await fetch(`https://app.finaleinventory.com/${account}/api/graphql`, {
        method: 'POST',
        headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ buildViewConnection(first: 999 ${cursor}) { pageInfo { hasNextPage endCursor } edges { node { ${FIELDS} } } } }` }),
        signal: AbortSignal.timeout(55_000),
      })
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
      const result = await res.json()

      const conn  = result?.data?.buildViewConnection
      const edges = (conn?.edges ?? []) as { node: Record<string, unknown> }[]

      for (const e of edges) {
        const n = e.node
        const completedStr   = parseFinaleDate(String(n.completeDateActual ?? ''))
        const startActualStr = parseFinaleDate(String(n.startDateActual ?? ''))
        const startStr       = parseFinaleDate(String(n.startDate ?? ''))
        const lastUpdatedStr = parseFinaleDate(String(n.recordLastUpdated ?? ''))
        const effectiveDate  = completedStr || startActualStr || startStr || lastUpdatedStr
        if (!effectiveDate) continue
        const product = n.productToProduce as { productId?: string; description?: string } | null
        const userEmail = (n.completeTransactionUser as { name?: string } | null)?.name ?? ''
        const completedBy = userEmail ? userEmail.split('@')[0].replace(/\b\w/g, c => c.toUpperCase()) : ''
        insert.run(
          String(n.buildId ?? ''), String(n.status ?? ''), String(n.validation ?? ''),
          product?.productId ?? '', product?.description ?? '',
          parseNum(n.quantityToProduce),
          startActualStr || startStr, completedStr,
          parseFinaleDate(String(n.completeDate ?? '')),
          effectiveDate, completedBy,
        )
        newBuilds++
      }

      if (conn?.pageInfo?.endCursor) lastCursor = conn.pageInfo.endCursor
      after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
      syncState.page++
      syncState.total = isIncremental
        ? newBuilds
        : (db.prepare('SELECT COUNT(*) as c FROM builds_cache').get() as { c: number }).c
    } while (after && syncState.page < 60)

    const now = new Date().toISOString()
    db.exec('DELETE FROM builds_sync_meta')
    db.prepare('INSERT INTO builds_sync_meta (id, synced_at, last_cursor) VALUES (1, ?, ?)').run(now, lastCursor)

    syncState.status   = 'done'
    syncState.syncedAt = now
  } catch (err) {
    syncState.status = 'error'
    syncState.error  = String(err)
  }
}

// GET ?days=N — read from SQLite cache
// GET ?progress=1 — return sync progress
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('progress') === '1') {
    return NextResponse.json(syncState)
  }

  try {
    const days = parseInt(searchParams.get('days') ?? '7', 10)
    // Use local date (not UTC) to match how Finale stores dates
    function localDate(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
    const todayStr  = localDate(new Date())
    const cutoffStr = days === 0
      ? todayStr
      : (() => { const c = new Date(); c.setDate(c.getDate() - days); return localDate(c) })()

    const db   = getDb()
    const meta = db.prepare('SELECT synced_at FROM builds_sync_meta WHERE id = 1').get() as { synced_at: string } | undefined
    const rows = db.prepare('SELECT * FROM builds_cache WHERE effective_date >= ? ORDER BY effective_date DESC').all(cutoffStr) as Record<string, unknown>[]
    const filtered = days === 0 ? rows.filter(r => r.effective_date === todayStr) : rows

    return NextResponse.json({
      builds: filtered.map(r => ({
        buildId:            String(r.build_id ?? ''),
        status:             String(r.status ?? ''),
        validation:         String(r.validation ?? ''),
        productId:          String(r.product_id ?? ''),
        productName:        String(r.product_name ?? ''),
        qtyToProduce:       Number(r.qty_to_produce ?? 0),
        startDate:          String(r.start_date ?? ''),
        completeDateActual: String(r.complete_date_actual ?? ''),
        completeDate:       String(r.complete_date ?? ''),
        completedBy:        String(r.completed_by ?? ''),
      })),
      syncedAt: meta?.synced_at ?? null,
    })
  } catch (err) {
    return NextResponse.json({ builds: [], error: String(err) }, { status: 500 })
  }
}

// POST — kick off background sync, return immediately
// ?full=1 clears the cursor to force a complete re-download
export async function POST(req: Request) {
  if (syncState.status === 'syncing') {
    return NextResponse.json({ started: false, reason: 'already syncing' })
  }
  const { searchParams } = new URL(req.url)
  if (searchParams.get('full') === '1') {
    // Clear cursor so runSync does a full re-download
    try {
      const db = getDb()
      db.exec('DELETE FROM builds_sync_meta')
    } catch { /* ignore */ }
  }
  runSync().catch(() => {})
  return NextResponse.json({ started: true })
}
