import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getCredentials() {
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password  = process.env.FINALE_PASSWORD?.trim() || ''
  const account   = (process.env.FINALE_ACCOUNT?.trim() || '').split('/')[0]
  const base64    = Buffer.from(`${username}:${password}`).toString('base64')
  return { account, base64 }
}

async function gql(account: string, base64: string, query: string) {
  const res = await fetch(`https://app.finaleinventory.com/${account}/api/graphql`, {
    method: 'POST',
    headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
  return res.json()
}

function parseNum(v: unknown): number {
  return parseFloat(String(v ?? '').replace(/,/g, '')) || 0
}

// Converts Finale date strings (M/D/YYYY or YYYY-MM-DD or ISO) to YYYY-MM-DD
function parseOrderDate(raw: string): string {
  if (!raw) return ''
  // M/D/YYYY or MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  // Already YYYY-MM-DD or ISO
  return raw.slice(0, 10)
}

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_spending (
      order_id     TEXT,
      order_number TEXT,
      order_status TEXT,
      vendor       TEXT,
      order_date   TEXT,
      product_id   TEXT,
      product_name TEXT,
      qty_ordered  REAL NOT NULL DEFAULT 0,
      unit_cost    REAL NOT NULL DEFAULT 0,
      line_total   REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  try { db.exec(`ALTER TABLE purchase_spending ADD COLUMN order_status TEXT`) } catch {}
}

const syncState = {
  status:      'idle' as 'idle' | 'syncing' | 'done' | 'error',
  count:       0,
  progress:    '' as string,
  error:       null as string | null,
  syncedAt:    null as string | null,
  debug:       null as { totalPos: number; sampleDates: string[]; targetPos: number } | null,
}

type GqlPo = {
  orderId: string
  status: string
  orderDate: string
  supplier: { name: string } | null
}

async function getAllPos(account: string, base64: string): Promise<GqlPo[]> {
  const all: GqlPo[] = []
  let after: string | null = null
  let page = 0
  do {
    const cursor = after ? `, after: "${after}"` : ''
    const result = await gql(account, base64, `{
      orderViewConnection(first: 999, type: "PURCHASE_ORDER" ${cursor}) {
        pageInfo { hasNextPage endCursor }
        edges { node { orderId status orderDate supplier { name } } }
      }
    }`)
    const conn  = result?.data?.orderViewConnection
    const edges = (conn?.edges ?? []) as { node: GqlPo }[]
    edges.forEach(e => all.push(e.node))
    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
    page++
  } while (after && page < 20)
  return all
}

async function syncSpending(months: string[]) {
  const { account, base64 } = getCredentials()
  const db = getDb()
  ensureSchema(db)

  // Delete existing data for target months
  for (const ym of months) {
    db.exec(`DELETE FROM purchase_spending WHERE substr(COALESCE(NULLIF(order_date,''), ''), 1, 7) = '${ym}'`)
  }

  const stmt = db.prepare(`
    INSERT INTO purchase_spending
      (order_id, order_number, order_status, vendor, order_date, product_id, product_name, qty_ordered, unit_cost, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  syncState.progress = 'Fetching all purchase orders from Finale…'
  const allPos = await getAllPos(account, base64)

  // Debug: capture sample raw dates
  const sampleDates = allPos.slice(0, 5).map(p => p.orderDate ?? 'null')
  console.log('[spending-sync] Total POs:', allPos.length, 'Sample dates:', sampleDates, 'Target months:', months)

  // Parse dates and filter to target months
  const monthSet = new Set(months)
  const targetPos = allPos
    .map(po => ({ ...po, parsedDate: parseOrderDate(po.orderDate ?? '') }))
    .filter(po => monthSet.has(po.parsedDate.slice(0, 7)))

  syncState.debug = { totalPos: allPos.length, sampleDates, targetPos: targetPos.length }
  syncState.progress = `Found ${allPos.length} total POs, ${targetPos.length} match target months, fetching line items…`
  let inserted = 0

  for (let i = 0; i < targetPos.length; i += 5) {
    const batch = targetPos.slice(i, i + 5)
    await Promise.all(batch.map(async (po) => {
      try {
        const result = await gql(account, base64, `{
          orderViewConnection(first: 1, orderId: "${po.orderId}") {
            edges {
              node {
                itemList(first: 200) {
                  edges {
                    node {
                      quantity unitPrice
                      product { productId description }
                    }
                  }
                }
              }
            }
          }
        }`)
        const items = result?.data?.orderViewConnection?.edges?.[0]?.node?.itemList?.edges ?? []
        for (const e of items as { node: { quantity: number; unitPrice: number; product: { productId: string; description: string } | null } }[]) {
          const it   = e.node
          const qty  = parseNum(it.quantity)
          const cost = parseNum(it.unitPrice)
          stmt.run(
            po.orderId,
            po.orderId,
            po.status ?? '',
            po.supplier?.name ?? '—',
            po.parsedDate,
            it.product?.productId ?? '',
            it.product?.description ?? '',
            qty,
            cost,
            qty * cost,
          )
          inserted++
        }
      } catch { /* skip individual PO errors */ }
    }))
    syncState.count    = inserted
    syncState.progress = `Processed ${Math.min(i + 5, targetPos.length)}/${targetPos.length} POs (${inserted} items)…`
  }

  return inserted
}

async function runSync(months: string[]) {
  syncState.status   = 'syncing'
  syncState.count    = 0
  syncState.progress = 'Starting…'
  syncState.error    = null

  try {
    const n = await syncSpending(months)
    syncState.count    = n
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
  const body = await req.json().catch(() => ({})) as { months?: string[] }
  const now  = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const months = body.months ?? [thisMonth]
  runSync(months).catch(() => {})
  return NextResponse.json({ started: true })
}
