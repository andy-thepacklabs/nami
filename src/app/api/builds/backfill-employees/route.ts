import { NextResponse } from 'next/server'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DB_PATH = path.join(process.cwd(), 'inventory.db')

function getCredentials() {
  const account  = process.env.FINALE_ACCOUNT?.trim() || ''
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password = process.env.FINALE_PASSWORD?.trim() || ''
  return { account, base64: Buffer.from(`${username}:${password}`).toString('base64') }
}

// POST — scan GraphQL pages and update completed_by for cached builds missing it
export async function POST() {
  const { account, base64 } = getCredentials()
  const db = new DatabaseSync(DB_PATH)

  // Find all build_ids in cache that are missing employee data
  const missing = (db.prepare(`SELECT build_id FROM builds_cache WHERE completed_by IS NULL OR completed_by = ''`).all() as { build_id: string }[]).map(r => r.build_id)

  if (missing.length === 0) return NextResponse.json({ updated: 0 })

  const missingSet = new Set(missing)
  const update = db.prepare(`UPDATE builds_cache SET completed_by = ? WHERE build_id = ?`)

  let after: string | null = null
  let page = 0
  let updated = 0

  // Page through Finale builds, updating any we find that are missing employee data
  do {
    const cursor = after ? `, after: "${after}"` : ''
    const res = await fetch(`https://app.finaleinventory.com/${account}/api/graphql`, {
      method: 'POST',
      headers: { Authorization: `Basic ${base64}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ buildViewConnection(first: 999 ${cursor}) { pageInfo { hasNextPage endCursor } edges { node { buildId completeTransactionUser { name } } } } }` }),
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) break
    const data = await res.json()
    const conn = data?.data?.buildViewConnection
    const edges = (conn?.edges ?? []) as { node: { buildId: string; completeTransactionUser?: { name?: string } | null } }[]

    for (const e of edges) {
      if (!missingSet.has(String(e.node.buildId))) continue
      const email = e.node.completeTransactionUser?.name ?? ''
      const name = email ? email.split('@')[0].replace(/\b\w/g, c => c.toUpperCase()) : ''
      update.run(name, String(e.node.buildId))
      missingSet.delete(String(e.node.buildId))
      updated++
    }

    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
    page++

    // Stop early if all missing records have been found
    if (missingSet.size === 0) break
  } while (after && page < 60)

  return NextResponse.json({ updated, remaining: missingSet.size })
}
