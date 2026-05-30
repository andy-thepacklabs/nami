import { NextResponse } from 'next/server'
import { runFullSync, getSyncStats } from '@/lib/sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  const stats = getSyncStats()
  return NextResponse.json(stats)
}

export async function POST() {
  try {
    const result = await runFullSync()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
