import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const INCLUDE_CATEGORIES = ['RAW MATERIALS', 'MARKETING']
const OPEN_STATUSES = ['committed', 'ordered', 'open', 'partial', 'backordered']

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

type GqlPo = {
  orderId: string
  status: string
  orderDate: string
  dueDate: string
  supplier: { name: string } | null
}

type GqlItem = {
  quantity: number
  productUnitsReceived: number
  productUnitsRemainingToBePackedShippedOrReceived: number
  unitPrice: number
  product: { productId: string; description: string; category: string } | null
}

export interface PoLine {
  orderId: string
  orderNumber: string
  supplier: string
  orderDate: string
  expectedDate: string
  productId: string
  productName: string
  category: string
  qtyOrdered: number
  qtyReceived: number
  qtyBackordered: number
  unitCost: number
}

async function getAllOpenPos(): Promise<GqlPo[]> {
  const open: GqlPo[] = []
  let after: string | null = null
  let page = 0

  do {
    const cursor = after ? `, after: "${after}"` : ''
    const result = await gql(`{
      orderViewConnection(first: 999, type: "PURCHASE_ORDER" ${cursor}) {
        pageInfo { hasNextPage endCursor }
        edges { node { orderId status orderDate dueDate supplier { name } } }
      }
    }`)
    const conn = result?.data?.orderViewConnection
    const edges = (conn?.edges ?? []) as { node: GqlPo }[]
    edges.forEach(e => {
      if (OPEN_STATUSES.includes((e.node.status ?? '').toLowerCase())) open.push(e.node)
    })
    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
    page++
  } while (after && page < 10)

  return open
}

async function getPoItems(orderId: string): Promise<GqlItem[]> {
  const result = await gql(`{
    orderViewConnection(first: 1, orderId: "${orderId}") {
      edges {
        node {
          itemList(first: 200) {
            edges {
              node {
                quantity
                productUnitsReceived
                productUnitsRemainingToBePackedShippedOrReceived
                unitPrice
                product { productId description category }
              }
            }
          }
        }
      }
    }
  }`)
  const edges = result?.data?.orderViewConnection?.edges?.[0]?.node?.itemList?.edges ?? []
  return edges.map((e: { node: GqlItem }) => e.node)
}

export async function GET() {
  try {
    const openPos = await getAllOpenPos()

    if (openPos.length === 0) {
      return NextResponse.json({ lines: [], debug: { message: 'No open POs found (statuses checked: Committed, Ordered, Open, Partial, Backordered)' } })
    }

    const lines: PoLine[] = []

    // Fetch items for each open PO in parallel (batches of 5)
    for (let i = 0; i < openPos.length; i += 5) {
      const batch = openPos.slice(i, i + 5)
      await Promise.all(batch.map(async (po) => {
        try {
          const items = await getPoItems(po.orderId)
          for (const item of items) {
            const cat = (item.product?.category ?? '').toUpperCase()
            if (!INCLUDE_CATEGORIES.some(inc => cat.includes(inc))) continue

            const qtyOrdered     = parseNum(item.quantity)
            const qtyReceived    = parseNum(item.productUnitsReceived)
            const qtyRemaining   = parseNum(item.productUnitsRemainingToBePackedShippedOrReceived)
            const qtyBackordered = qtyRemaining > 0 ? qtyRemaining : Math.max(0, qtyOrdered - qtyReceived)
            if (qtyBackordered <= 0) continue

            lines.push({
              orderId:       po.orderId,
              orderNumber:   po.orderId,
              supplier:      po.supplier?.name ?? '—',
              orderDate:     po.orderDate ?? '',
              expectedDate:  po.dueDate ?? '',
              productId:     item.product?.productId ?? '',
              productName:   item.product?.description ?? '',
              category:      item.product?.category ?? '',
              qtyOrdered,
              qtyReceived,
              qtyBackordered,
              unitCost:      parseNum(item.unitPrice),
            })
          }
        } catch { /* skip individual PO errors */ }
      }))
    }

    lines.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
    return NextResponse.json({ lines, debug: { openPoCount: openPos.length } })

  } catch (err) {
    return NextResponse.json({ lines: [], error: String(err) }, { status: 500 })
  }
}
