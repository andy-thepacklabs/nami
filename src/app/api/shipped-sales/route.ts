import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SHIPPED_STATUSES = ['shipped', 'complete', 'completed', 'closed', 'fulfilled']

function parseNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  return parseFloat(String(v).replace(/,/g, '')) || 0
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

export interface SaleOrder {
  orderId: string
  orderNumber: string
  customer: string
  orderDate: string
  shipDate: string
  status: string
  subtotal: number
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const days = parseInt(searchParams.get('days') ?? '30', 10)

    const cutoff = startDate ? new Date(startDate) : new Date()
    if (!startDate) cutoff.setDate(cutoff.getDate() - days)

    // Fetch most recent 500 sales orders using last/before for reverse pagination
    const result = await gql(`{
      orderViewConnection(last: 500, type: "SALES_ORDER") {
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

    const edges = (result?.data?.orderViewConnection?.edges ?? []) as { node: Record<string, unknown> }[]

    const orders: SaleOrder[] = []
    for (const e of edges) {
      const n = e.node
      const status = String(n.status ?? '').toLowerCase()
      if (!SHIPPED_STATUSES.includes(status)) continue

      // Use shipDate if available, fall back to orderDate for filtering
      const shipDateStr = String(n.shipDate ?? '').trim()
      const orderDateStr = String(n.orderDate ?? '').trim()
      const effectiveDate = shipDateStr || orderDateStr
      const effectiveD = effectiveDate ? new Date(effectiveDate) : null

      // Skip if the effective date is before the cutoff
      if (!effectiveD || effectiveD < cutoff) continue

      orders.push({
        orderId:     String(n.orderId ?? ''),
        orderNumber: String(n.orderId ?? ''),
        customer:    (n.customer as { name?: string } | null)?.name ?? '—',
        orderDate:   orderDateStr,
        shipDate:    shipDateStr,
        status:      String(n.status ?? ''),
        subtotal:    parseNum(n.subtotal),
      })
    }

    orders.sort((a, b) => {
      const da = (b.shipDate || b.orderDate) ?? ''
      const db = (a.shipDate || a.orderDate) ?? ''
      return da.localeCompare(db)
    })

    return NextResponse.json({ orders, debug: { total: edges.length, filtered: orders.length } })

  } catch (err) {
    return NextResponse.json({ orders: [], error: String(err) }, { status: 500 })
  }
}
