import { NextResponse } from 'next/server'
import { runStockSync } from '@/lib/sync'

export const dynamic = 'force-dynamic'

const COOLDOWN_MS = 60_000
let lastSyncAt = 0
let syncInProgress = false

export async function POST() {
  if (syncInProgress) {
    return NextResponse.json({ error: 'Sync already in progress. Please wait.' }, { status: 429 })
  }
  const now = Date.now()
  if (now - lastSyncAt < COOLDOWN_MS) {
    const secondsLeft = Math.ceil((COOLDOWN_MS - (now - lastSyncAt)) / 1000)
    return NextResponse.json({ error: `Please wait ${secondsLeft}s before syncing again.` }, { status: 429 })
  }
  syncInProgress = true
  lastSyncAt = now
  try {
    const result = await runStockSync()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  } finally {
    syncInProgress = false
  }
}
