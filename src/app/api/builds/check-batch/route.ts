import { NextResponse } from 'next/server'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DB_PATH = path.join(process.cwd(), 'inventory.db')

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

function extractEmployee(data: Record<string, unknown>): string {
  // Find PRUN_COMPLETED entry in statusIdHistoryList, extract email prefix as name
  const history = (data.statusIdHistoryList ?? []) as { statusId: string | null; userLoginUrl?: string }[]
  const completed = history.find(h => h.statusId === 'PRUN_COMPLETED')
  const url = completed?.userLoginUrl ?? ''
  if (!url) return ''
  const email = decodeURIComponent(url.split('/').pop() ?? '')
  return email.split('@')[0].replace(/\b\w/g, c => c.toUpperCase())
}

// Map Finale REST statusId → display status
const STATUS_MAP: Record<string, string> = {
  PRUN_COMPLETED: 'Completed',
  PRUN_CANCELLED: 'Cancelled',
  PRUN_STARTED:   'Started',
  PRUN_CREATED:   'Created',
}

async function checkBuild(buildId: string, account: string, base64: string, fmap: Map<string, string>) {
  const res = await fetch(`https://app.finaleinventory.com/${account}/api/workeffort/${encodeURIComponent(buildId)}`, {
    headers: { Authorization: `Basic ${base64}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return { buildId, issueCount: 0, lines: [], completedBy: '', liveStatus: null as string | null }
  const data = await res.json() as Record<string, unknown>

  const completedBy = extractEmployee(data)
  const liveStatus = STATUS_MAP[String(data.statusId ?? '')] ?? null

  const consumeList = (data.workEffortConsumeList ?? []) as {
    productId: string; facilityUrl: string; quantity: number
  }[]

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

  return { buildId, issueCount: lines.filter(l => l.hasIssue).length, lines, completedBy, liveStatus }
}

// POST { buildIds: string[] } → { results: { buildId, issueCount, lines, completedBy }[] }
export async function POST(req: Request) {
  try {
    const { buildIds } = await req.json() as { buildIds: string[] }
    if (!Array.isArray(buildIds) || buildIds.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const { account, base64 } = getCredentials()
    const fmap = await getFacilityMap(account, base64)

    const ids = buildIds.slice(0, 60)
    const CONCURRENCY = 8
    const results = []

    const db = new DatabaseSync(DB_PATH)
    const updateCache = db.prepare(`UPDATE builds_cache SET completed_by = COALESCE(NULLIF(?, ''), completed_by), status = COALESCE(?, status) WHERE build_id = ?`)

    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(id => checkBuild(id, account, base64, fmap).catch(() => ({ buildId: id, issueCount: 0, lines: [], completedBy: '', liveStatus: null as string | null })))
      )
      for (const r of batchResults) {
        updateCache.run(r.completedBy || null, r.liveStatus, r.buildId)
      }
      results.push(...batchResults)
    }

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({ results: [], error: String(err) }, { status: 500 })
  }
}
