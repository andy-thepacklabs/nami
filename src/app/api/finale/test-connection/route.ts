import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Finale uses session-based auth: POST /api/session to login, get cookie, then use cookie
export async function finaleLogin(account: string, username: string, password: string) {
  const loginUrl = `https://app.finaleinventory.com/${account}/api/session`
  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  // Extract Set-Cookie header
  const cookie = res.headers.get('set-cookie')
  return { status: res.status, cookie }
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

  try {
    // Step 1: Login to get session cookie
    const { status: loginStatus, cookie } = await finaleLogin(account, username, password)

    if (loginStatus === 404) {
      return NextResponse.json({ ok: false, msg: `Account "${account}" not found — check your account name (the subdomain on app.finaleinventory.com).` })
    }
    if (!cookie && loginStatus !== 200 && loginStatus !== 302) {
      return NextResponse.json({ ok: false, msg: `Login failed — Finale returned ${loginStatus}. Check your username and password.` })
    }

    // Step 2: Use session cookie to fetch a product (validates credentials work)
    const productUrl = `https://app.finaleinventory.com/${account}/api/product?limit=1`
    const res = await fetch(productUrl, {
      headers: {
        Cookie: cookie || '',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ ok: false, msg: 'Login succeeded but API access was denied. Check your Finale account permissions.' })
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, msg: `Finale returned ${res.status}: ${body.slice(0, 200)}` })
    }

    const data = await res.json()
    const count = Array.isArray(data) ? data.length : (data?.results?.length ?? '?')
    return NextResponse.json({ ok: true, msg: `Connected! Finale account "${account}" is working. (${count} product(s) fetched)` })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('timeout') || msg.includes('abort')) {
      return NextResponse.json({ ok: false, msg: 'Connection timed out. Check your network or Finale may be down.' })
    }
    return NextResponse.json({ ok: false, msg: `Connection error: ${msg}` })
  }
}
