import { NextRequest, NextResponse } from 'next/server'
import { fetchSheetData } from '@/lib/sheets'
import { compareWithFinale, saveComparison } from '@/lib/compare'
import { getGoogleSheetId, getGoogleSheetTab } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sheetId = body.sheetId || getGoogleSheetId()
  const range = body.range || body.sheetName || getGoogleSheetTab()
  const countedBy = body.countedBy || 'Unknown'

  if (!sheetId) return NextResponse.json({ error: 'No sheet ID configured. Go to Settings.' }, { status: 400 })

  try {
    const sheetRows = await fetchSheetData(sheetId, range)
    if (sheetRows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in the sheet. Check column headers.' }, { status: 400 })
    }

    const comparison = compareWithFinale(sheetRows)
    const compId = saveComparison(comparison, sheetId, range, countedBy)

    return NextResponse.json({ id: compId, ...comparison })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
