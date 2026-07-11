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

export interface TransferRecord {
  transferId: string
  transferDate: string
  note: string
  quantity: number
  productId: string
  productName: string
  originFacility: string
  destinationFacility: string
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') ?? '30', 10)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const records: TransferRecord[] = []
    let after: string | null = null
    let page = 0

    do {
      const cursor = after ? `, after: "${after}"` : ''
      const result = await gql(`{
        quickTransferViewConnection(first: 200 ${cursor}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              quickTransferId
              transferDate
              note
              quantity
              product { productId description }
              originFacility { name }
              destinationFacility { name }
            }
          }
        }
      }`)

      const conn = result?.data?.quickTransferViewConnection
      const edges = (conn?.edges ?? []) as { node: Record<string, unknown> }[]

      for (const e of edges) {
        const n = e.node
        const dateStr = parseFinaleDate(String(n.transferDate ?? ''))
        if (dateStr && dateStr < cutoffStr) continue

        const product = n.product as { productId?: string; description?: string } | null
        const origin  = n.originFacility as { name?: string } | null
        const dest    = n.destinationFacility as { name?: string } | null
        records.push({
          transferId:          String(n.quickTransferId ?? ''),
          transferDate:        dateStr,
          note:                String(n.note ?? ''),
          quantity:            parseNum(n.quantity),
          productId:           product?.productId ?? '',
          productName:         product?.description ?? '',
          originFacility:      origin?.name ?? '',
          destinationFacility: dest?.name ?? '',
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
