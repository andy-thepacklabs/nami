import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds

function getCredentials() {
  const account  = process.env.FINALE_ACCOUNT?.trim() || ''
  const username = process.env.FINALE_USERNAME?.trim() || ''
  const password = process.env.FINALE_PASSWORD?.trim() || ''
  const apiAccount = account.split('/')[0]
  const base64 = Buffer.from(`${username}:${password}`).toString('base64')
  return { account: apiAccount, base64 }
}

async function finaleGet(path: string): Promise<{ status: number; data: unknown }> {
  const { account, base64 } = getCredentials()
  const url = `https://app.finaleinventory.com/${account}/api/${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${base64}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  let data: unknown = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

async function finaleGraphQL(query: string): Promise<unknown> {
  const { account, base64 } = getCredentials()
  const url = `https://app.finaleinventory.com/${account}/api/graphql`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
  return res.json()
}

// Parse sublocation summary string like "A1-01 (10), A1-02 (5)" or "A1-01:10, A1-02:5"
function parseSublocationSummary(summary: string | null | undefined): Array<{ bin: string; qty: number }> {
  if (!summary || typeof summary !== 'string') return []
  const result: Array<{ bin: string; qty: number }> = []

  // Try format: "BinName (qty)" — e.g. "A1-01 (10)"
  const parensPattern = /([^,()]+?)\s*\((\d+(?:\.\d+)?)\)/g
  let m: RegExpExecArray | null
  while ((m = parensPattern.exec(summary)) !== null) {
    const bin = m[1].trim()
    const qty = parseFloat(m[2])
    if (bin && !isNaN(qty) && qty > 0) result.push({ bin, qty })
  }
  if (result.length > 0) return result

  // Try format: "BinName:qty" — e.g. "A1-01:10"
  const colonPattern = /([^,:]+?)\s*:\s*(\d+(?:\.\d+)?)/g
  while ((m = colonPattern.exec(summary)) !== null) {
    const bin = m[1].trim()
    const qty = parseFloat(m[2])
    if (bin && !isNaN(qty) && qty > 0) result.push({ bin, qty })
  }
  return result
}

// GET: inspect raw Finale field names (for debugging)
export async function GET() {
  const { account } = getCredentials()
  if (!account) return NextResponse.json({ error: 'No credentials' }, { status: 400 })
  const res = await finaleGet('product?limit=2')
  const raw = res.data as Record<string, unknown>
  const fields = raw && typeof raw === 'object' ? Object.keys(raw) : []
  const sample: Record<string, unknown> = {}
  for (const f of fields) {
    const arr = raw[f]
    sample[f] = Array.isArray(arr) ? arr[0] : arr
  }
  return NextResponse.json({ status: res.status, fields, sample })
}

interface GqlProductNode {
  productId: string
  description: string
  category: string
  status: string
  unitsInStock: string | number | null   // GraphQL returns this as a string e.g. "70040"
  stockSublocationSummary: string | null
}

export async function POST() {
  const { account } = getCredentials()
  if (!account) {
    return NextResponse.json({ error: 'Finale credentials not configured. Go to Settings first.' }, { status: 400 })
  }

  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_stock_csv (
      product_id   TEXT NOT NULL,
      bin_location TEXT NOT NULL DEFAULT '',
      product_name TEXT,
      category     TEXT,
      qoh          REAL NOT NULL DEFAULT 0,
      imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, bin_location)
    )
  `)
  try { db.exec(`ALTER TABLE finale_stock_csv ADD COLUMN category TEXT`) } catch { /* already exists */ }

  // --- Try GraphQL path first ---
  try {
    const allProducts: GqlProductNode[] = []
    let hasNextPage = true
    let cursor: string | null = null
    const PAGE = 200

    while (hasNextPage) {
      const afterArg = cursor ? `, after: "${cursor}"` : ''
      const query = `{
        productViewConnection(first: ${PAGE}${afterArg}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              productId
              description
              category
              status
              unitsInStock
              stockSublocationSummary
            }
          }
        }
      }`

      const result = await finaleGraphQL(query) as {
        data?: {
          productViewConnection?: {
            pageInfo: { hasNextPage: boolean; endCursor: string }
            edges: Array<{ node: GqlProductNode }>
          }
        }
        errors?: Array<{ message: string }>
      }

      if (result.errors?.length) {
        throw new Error(result.errors[0].message)
      }

      const conn = result.data?.productViewConnection
      if (!conn) throw new Error('No productViewConnection in GraphQL response')

      for (const edge of conn.edges) {
        allProducts.push(edge.node)
      }

      hasNextPage = conn.pageInfo.hasNextPage
      cursor = conn.pageInfo.endCursor
    }

    // Filter inactive
    let skipped = 0
    const activeProducts = allProducts.filter(p => {
      const s = (p.status || '').toUpperCase()
      if (s === 'PRODUCT_INACTIVE' || s === 'INACTIVE') { skipped++; return false }
      return true
    })

    if (activeProducts.length === 0) {
      return NextResponse.json({ error: 'No active products found in Finale.' }, { status: 500 })
    }

    // Detect if we have any real sublocation data
    const hasSublocs = activeProducts.some(p => p.stockSublocationSummary && p.stockSublocationSummary.trim() !== '')

    db.prepare('DELETE FROM finale_stock_csv').run()
    const ins = db.prepare(`
      INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, category, qoh, imported_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `)

    let imported = 0

    db.exec('BEGIN')
    try {
      for (const p of activeProducts) {
        const pid  = (p.productId || '').trim()
        const name = (p.description || '').trim()
        const cat  = (p.category || '').trim()
        if (!pid) continue

        if (hasSublocs && p.stockSublocationSummary) {
          const bins = parseSublocationSummary(p.stockSublocationSummary)
          if (bins.length > 0) {
            for (const { bin, qty } of bins) {
              ins.run(pid, bin, name, cat, qty)
              imported++
            }
            continue
          }
        }

        // No sublocation data — store product total
        const qoh = parseFloat(String(p.unitsInStock ?? '0')) || 0
        ins.run(pid, '', name, cat, qoh)
        imported++
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    return NextResponse.json({
      ok: true,
      source: 'graphql',
      products: activeProducts.length,
      imported,
      skipped,
      note: hasSublocs ? `QoH & sublocations synced from Finale ✓` : `QoH synced ✓ — no sublocation data in Finale`,
    })

  } catch (gqlErr) {
    const errMsg = gqlErr instanceof Error ? gqlErr.message : String(gqlErr)
    console.warn('[sync] GraphQL failed, falling back to REST:', errMsg)
    // REST fallback will run below — attach error to note
    ;(globalThis as Record<string, unknown>).__lastGqlError = errMsg
  }

  // --- Fallback: REST product API (category + product names only, QoH=0) ---
  const prodRes = await finaleGet('product?limit=5000')
  if (prodRes.status !== 200) {
    return NextResponse.json({ error: `Finale API returned ${prodRes.status}. Check your credentials.` }, { status: 500 })
  }

  const raw = prodRes.data as Record<string, unknown[]>
  const productIds   = (raw.productId    || []) as string[]
  const productNames = (raw.internalName || raw.description || raw.name || []) as string[]
  const statusIds    = (raw.statusId     || raw.status || []) as string[]
  const categories   = (raw.category     || []) as string[]

  const productMap = new Map<string, { name: string; category: string }>()
  let skipped = 0
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i]?.trim()
    if (!pid) continue
    const status = (statusIds[i] || '').toString().toUpperCase()
    if (status === 'PRODUCT_INACTIVE' || status === 'INACTIVE') { skipped++; continue }
    productMap.set(pid, { name: productNames[i] || '', category: categories[i] || '' })
  }

  if (productMap.size === 0) {
    return NextResponse.json({ error: 'No active products found in Finale.' }, { status: 500 })
  }

  db.prepare('DELETE FROM finale_stock_csv').run()
  const ins = db.prepare(`
    INSERT OR REPLACE INTO finale_stock_csv (product_id, bin_location, product_name, category, qoh, imported_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `)
  for (const [pid, { name, category }] of productMap) {
    ins.run(pid, '', name, category)
  }
  return NextResponse.json({
    ok: true,
    source: 'rest-fallback',
    products: productMap.size,
    imported: productMap.size,
    skipped,
    note: `Category synced ✓ — GraphQL error: ${(globalThis as Record<string, unknown>).__lastGqlError ?? 'unknown'}`,
  })
}
