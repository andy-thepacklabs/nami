import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Strip full URL if user pasted it
export function normalizeAccount(raw: string): string {
  let s = raw.trim().replace(/[/?#]+$/, '')
  if (s.startsWith('http')) {
    try {
      const u = new URL(s)
      s = u.pathname.replace(/^\//, '').replace(/\/$/, '')
    } catch {
      s = s.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '')
    }
  }
  return s
}

export async function GET() {
  const account  = process.env.FINALE_ACCOUNT
  const username = process.env.FINALE_USERNAME
  const password = process.env.FINALE_PASSWORD

  if (!account || !username || !password) {
    return NextResponse.json({
      ok: false,
      msg: 'Credentials not configured. Enter your Finale account, username, and password above and click Save first.',
    })
  }

  const cleanAccount = normalizeAccount(account)
  // sc2 is a UI route — strip it for API calls, keep only the first segment
  const apiAccount = cleanAccount.split('/')[0]
  const base64 = Buffer.from(`${username}:${password}`).toString('base64')

  // Try both account paths: with and without the sub-path
  const candidates = Array.from(new Set([apiAccount, cleanAccount]))

  for (const acct of candidates) {
    const url = `https://app.finaleinventory.com/${acct}/api/product?limit=1`
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Basic ${base64}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      })

      const body = await res.text()

      if (res.status === 401) {
        return NextResponse.json({ ok: false, msg: `Invalid credentials (401) — double-check your Finale email and password. Account tried: ${acct}` })
      }
      if (res.status === 403) {
        continue // try next candidate
      }
      if (res.status === 404) {
        continue // try next candidate
      }
      if (!res.ok) {
        return NextResponse.json({ ok: false, msg: `Finale returned HTTP ${res.status} at "${acct}": ${body.slice(0, 200)}` })
      }

      let data
      try { data = JSON.parse(body) } catch { data = null }
      const count = Array.isArray(data) ? data.length : (data?.results?.length ?? '?')

      // Save the working account path back to env
      process.env.FINALE_ACCOUNT = acct

      return NextResponse.json({ ok: true, msg: `Connected! Finale account "${acct}" is working. (${count} product(s) fetched)` })

    } catch { continue }
  }

  return NextResponse.json({ ok: false, msg: `Could not connect to Finale. Tried: ${candidates.join(', ')}.\n\nPossible causes:\n• Wrong email or password\n• API access not enabled for your user (check Finale → Admin → Users)\n• Your Finale plan may not include API access` })
}
