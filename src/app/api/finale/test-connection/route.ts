import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

  const base64 = Buffer.from(`${username}:${password}`).toString('base64')
  const url = `https://app.finaleinventory.com/${account}/api/product?limit=1`

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${base64}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (res.status === 401) {
      return NextResponse.json({ ok: false, msg: 'Invalid credentials — Finale returned 401 Unauthorized. Check your username and password.' })
    }
    if (res.status === 404) {
      return NextResponse.json({ ok: false, msg: `Account "${account}" not found — check your account name (the subdomain on app.finaleinventory.com).` })
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, msg: `Finale returned ${res.status}: ${body.slice(0, 200)}` })
    }

    const data = await res.json()
    const count = Array.isArray(data) ? data.length : (data?.results?.length ?? '?')
    return NextResponse.json({ ok: true, msg: `Connected to Finale account "${account}" — API is working. (${count} product(s) returned)` })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('timeout') || msg.includes('abort')) {
      return NextResponse.json({ ok: false, msg: 'Connection timed out. Check your network or Finale may be down.' })
    }
    return NextResponse.json({ ok: false, msg: `Connection error: ${msg}` })
  }
}
