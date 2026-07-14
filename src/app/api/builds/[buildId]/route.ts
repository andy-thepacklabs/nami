import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Approved keywords — a facility is approved if its name contains any of these (case-insensitive)
const APPROVED_KEYWORDS = [
  'Production Main', 'Fulfillment Main',
  'Jiko', 'Futurola', 'Qa/Qc', 'QaQc', 'Vape Station', 'AuraX',
]

function isApproved(facilityName: string) {
  const lower = facilityName.toLowerCase()
  return APPROVED_KEYWORDS.some(k => lower.includes(k.toLowerCase()))
}

function getCredentials() {
  const account  = process.env.FINALE_ACCOUNT?.trim() || ''
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password = process.env.FINALE_PASSWORD?.trim() || ''
  return { account, base64: Buffer.from(`${username}:${password}`).toString('base64') }
}

// Process-level cache: facilityUrl → name (loaded once, reused for all requests)
let facilityMap: Map<string, string> | null = null

async function getFacilityMap(account: string, base64: string): Promise<Map<string, string>> {
  if (facilityMap) return facilityMap

  const map = new Map<string, string>()
  let after: string | null = null

  do {
    const cursor = after ? `, after: "${after}"` : ''
    const res = await fetch(`https://app.finaleinventory.com/${account}/api/graphql`, {
      method: 'POST',
      headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ facilityViewConnection(first: 999 ${cursor}) { pageInfo { hasNextPage endCursor } edges { node { facilityUrl name } } } }` }),
      signal: AbortSignal.timeout(20_000),
    })
    const d = await res.json()
    const conn = d?.data?.facilityViewConnection
    for (const e of (conn?.edges ?? [])) map.set(e.node.facilityUrl, e.node.name)
    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
  } while (after)

  facilityMap = map
  return map
}

export async function GET(_req: Request, { params }: { params: Promise<{ buildId: string }> }) {
  try {
    const { buildId } = await params
    const { account, base64 } = getCredentials()

    // Load facility map + build data in parallel
    const [fmap, buildRes] = await Promise.all([
      getFacilityMap(account, base64),
      fetch(`https://app.finaleinventory.com/${account}/api/workeffort/${encodeURIComponent(buildId)}`, {
        headers: { Authorization: `Basic ${base64}` },
        signal: AbortSignal.timeout(15_000),
      }),
    ])

    if (!buildRes.ok) throw new Error(`REST ${buildRes.status}`)
    const data = await buildRes.json()

    const consumeList = (data.workEffortConsumeList ?? []) as {
      productId: string
      facilityUrl: string
      quantity: number
    }[]

    // Group by productId, resolve names instantly from cache
    const byProduct = new Map<string, { facilityName: string; quantity: number }[]>()
    for (const item of consumeList) {
      const facilityPath = item.facilityUrl?.replace(`/${account}`, '') ?? item.facilityUrl
      const name = fmap.get(item.facilityUrl) ?? fmap.get(facilityPath) ?? item.facilityUrl
      if (!byProduct.has(item.productId)) byProduct.set(item.productId, [])
      byProduct.get(item.productId)!.push({ facilityName: name, quantity: item.quantity })
    }

    const lines = Array.from(byProduct.entries()).map(([productId, locations]) => {
      const hasApproved   = locations.some(l => isApproved(l.facilityName))
      const hasUnapproved = locations.some(l => !isApproved(l.facilityName))
      const isSplit = hasApproved && hasUnapproved
      const isWrong = !hasApproved && hasUnapproved
      return { productId, locations, isSplit, isWrong, hasIssue: isSplit || isWrong }
    })

    return NextResponse.json({
      buildId,
      lines,
      issueCount: lines.filter(l => l.hasIssue).length,
      approvedLocations: APPROVED_KEYWORDS,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
