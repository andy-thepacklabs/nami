import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  return parseFloat(String(v).replace(/,/g, '').replace(/\$/g, '').trim()) || 0
}

function getCredentials() {
  const account  = process.env.FINALE_ACCOUNT?.trim() || ''
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password = process.env.FINALE_PASSWORD?.trim() || ''
  const apiAccount = account.split('/')[0]
  const base64 = Buffer.from(`${username}:${password}`).toString('base64')
  return { account: apiAccount, base64 }
}

async function gql(query: string) {
  const { account, base64 } = getCredentials()
  const res = await fetch(`https://app.finaleinventory.com/${account}/api/graphql`, {
    method: 'POST',
    headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
  return res.json()
}

function ensureSchema(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipped_sales_csv (
      order_id     TEXT NOT NULL,
      customer     TEXT,
      order_date   TEXT,
      ship_date    TEXT,
      product_id   TEXT,
      product_name TEXT,
      category     TEXT,
      qty_shipped  REAL NOT NULL DEFAULT 0,
      unit_price   REAL NOT NULL DEFAULT 0,
      subtotal     REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

export async function POST() {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const startStr = monthStart.toISOString().split('T')[0]  // 2026-07-01

    const db = getDb()
    ensureSchema(db)

    // Paginate from the end using last: to get most recent orders
    // We collect orders whose orderDate >= monthStart
    const orders: { orderId: string; customer: string; orderDate: string; shipDate: string; subtotal: number }[] = []

    let after: string | null = null
    let page = 0
    let foundInRange = false

    do {
      const cursor = after ? `, after: "${after}"` : ''
      const result = await gql(`{
        orderViewConnection(first: 999, type: "SALES_ORDER" ${cursor}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              orderId
              status
              orderDate
              shipDate
              customer { name }
              subtotal
            }
          }
        }
      }`)

      const conn = result?.data?.orderViewConnection
      const edges = (conn?.edges ?? []) as { node: Record<string, unknown> }[]

      for (const e of edges) {
        const n = e.node
        const effectiveDateStr = String(n.orderDate ?? n.shipDate ?? '').trim()
        if (!effectiveDateStr) continue
        const effectiveDate = new Date(effectiveDateStr)
        if (isNaN(effectiveDate.getTime())) continue
        if (effectiveDate >= monthStart) {
          foundInRange = true
          orders.push({
            orderId:   String(n.orderId ?? ''),
            customer:  (n.customer as { name?: string } | null)?.name ?? '—',
            orderDate: String(n.orderDate ?? ''),
            shipDate:  String(n.shipDate ?? ''),
            subtotal:  parseNum(n.subtotal),
          })
        }
      }

      after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
      page++

      // Stop after 15 pages (~15k orders) to avoid timeout
      if (page >= 15) break
    } while (after)

    // Delete and re-insert this month's orders
    db.exec(`DELETE FROM shipped_sales_csv WHERE order_date >= '${startStr}' OR order_date = ''`)

    const stmt = db.prepare(`
      INSERT INTO shipped_sales_csv (order_id, customer, order_date, ship_date, product_id, product_name, category, qty_shipped, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const o of orders) {
      stmt.run(o.orderId, o.customer, o.orderDate, o.shipDate, '', '', '', 0, 0, o.subtotal)
    }

    return NextResponse.json({
      ok: true,
      orderCount: orders.length,
      pages: page,
      dateRange: `${startStr} → ${now.toISOString().split('T')[0]}`,
      foundInRange,
    })

  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
