import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

async function gql(query: string) {
  const { account, base64 } = getCredentials()
  const res = await fetch(`https://app.finaleinventory.com/${account}/api/graphql`, {
    method: 'POST',
    headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
  return res.json()
}

export interface ReceivingRecord {
  shipmentId: string
  title: string
  type: string
  status: string
  receiveDateActual: string
  totalUnits: number
  subtotal: number
  orderId: string
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') ?? '30', 10)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const records: ReceivingRecord[] = []
    let after: string | null = null
    let page = 0

    do {
      const cursor = after ? `, after: "${after}"` : ''
      const result = await gql(`{
        shipmentViewConnection(first: 200 ${cursor}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              shipmentId
              title
              type
              status
              receiveDateActual
              totalUnits
              subtotal
              order { orderId }
            }
          }
        }
      }`)

      const conn = result?.data?.shipmentViewConnection
      const edges = (conn?.edges ?? []) as { node: Record<string, unknown> }[]

      for (const e of edges) {
        const n = e.node
        // Only receiving/put-away = Purchase type shipments
        if (String(n.type ?? '').toLowerCase() !== 'purchase') continue

        const dateStr = parseFinaleDate(String(n.receiveDateActual ?? ''))
        if (dateStr && dateStr < cutoffStr) continue

        const order = n.order as { orderId?: string } | null
        records.push({
          shipmentId:        String(n.shipmentId ?? ''),
          title:             String(n.title ?? ''),
          type:              String(n.type ?? ''),
          status:            String(n.status ?? ''),
          receiveDateActual: dateStr,
          totalUnits:        parseNum(n.totalUnits),
          subtotal:          parseNum(n.subtotal),
          orderId:           order?.orderId ?? '',
        })
      }

      after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
      page++
    } while (after && page < 15)

    return NextResponse.json({ records, debug: { count: records.length, pages: page } })
  } catch (err) {
    return NextResponse.json({ records: [], error: String(err) }, { status: 500 })
  }
}
