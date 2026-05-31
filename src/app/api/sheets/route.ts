import { NextRequest, NextResponse } from 'next/server'
import { testSheetConnection } from '@/lib/sheets'
import { getGoogleSheetId } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sheetId = new URL(req.url).searchParams.get('id') || getGoogleSheetId()
  if (!sheetId) return NextResponse.json({ error: 'No sheet ID configured. Go to Settings.' }, { status: 400 })

  const result = await testSheetConnection(sheetId)
  return NextResponse.json(result)
}
