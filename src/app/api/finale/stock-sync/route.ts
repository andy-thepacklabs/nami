import { NextResponse } from 'next/server'
import { runStockSync } from '@/lib/sync'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await runStockSync()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
