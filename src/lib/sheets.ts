import { google } from 'googleapis'
import { getGoogleServiceAccountJson } from './settings'

function getAuth() {
  const credentials = getGoogleServiceAccountJson()
  if (!credentials) throw new Error('No Google service account configured. Go to Settings to add it.')

  const parsed = JSON.parse(credentials)
  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export interface SheetRow {
  productId: string
  binLocation: string
  physicalCount: number
  rawRow: string[]
}

export async function fetchSheetData(spreadsheetId: string, range: string): Promise<SheetRow[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const rows = res.data.values
  if (!rows || rows.length < 2) return []

  // First row is header — find columns by name
  const header = rows[0].map((h: string) => h.toLowerCase().trim())
  const pidCol = header.findIndex((h: string) => h.includes('product') || h.includes('sku') || h.includes('item'))
  const binCol = header.findIndex((h: string) => h.includes('bin') || h.includes('location') || h.includes('rack'))
  const countCol = header.findIndex((h: string) => h.includes('count') || h.includes('qty') || h.includes('quantity') || h.includes('physical'))

  if (pidCol === -1 || countCol === -1) {
    throw new Error(
      `Could not find required columns. Found headers: [${header.join(', ')}]. ` +
      `Need a column containing "product/sku/item" and one containing "count/qty/quantity/physical".`
    )
  }

  const result: SheetRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const productId = row[pidCol]?.toString().trim()
    const binLocation = binCol >= 0 ? row[binCol]?.toString().trim() : ''
    const countStr = row[countCol]?.toString().trim()

    if (!productId || !countStr) continue
    const physicalCount = parseFloat(countStr)
    if (isNaN(physicalCount)) continue

    result.push({ productId, binLocation, physicalCount, rawRow: row })
  }

  return result
}

export async function testSheetConnection(spreadsheetId: string): Promise<{
  ok: boolean
  sheetTitle?: string
  rowCount?: number
  headers?: string[]
  error?: string
}> {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const title = meta.data.sheets?.[0]?.properties?.title || 'Sheet1'

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${title}!A1:Z1`,
    })

    const headers = res.data.values?.[0] || []
    const countRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${title}!A:A`,
    })
    const rowCount = (countRes.data.values?.length || 1) - 1

    return { ok: true, sheetTitle: title, rowCount, headers }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
