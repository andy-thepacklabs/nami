import { NextRequest, NextResponse } from 'next/server'
import { compareWithFinale, saveComparison } from '@/lib/compare'
import type { SheetRow } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const countedBy = (formData.get('countedBy') as string | null) || 'CSV Upload'

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })

  // Parse header row — detect columns by name
  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').toLowerCase().trim())
  const pidCol = header.findIndex(h => h.includes('product') || h.includes('sku') || h.includes('item'))
  const binCol = header.findIndex(h => h.includes('bin') || h.includes('location') || h.includes('rack'))
  const countCol = header.findIndex(h => h.includes('count') || h.includes('qty') || h.includes('quantity') || h.includes('physical'))

  if (pidCol === -1 || countCol === -1) {
    return NextResponse.json({
      error: `Could not find required columns. Found: [${header.join(', ')}]. Need a column with "product/sku/item" and one with "count/qty/quantity/physical".`
    }, { status: 400 })
  }

  const rows: SheetRow[] = []
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV fields
    const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || lines[i].split(',')
    const clean = cols.map(c => c.replace(/^"|"$/g, '').trim())

    const productId = clean[pidCol]
    const binLocation = binCol >= 0 ? (clean[binCol] || '') : ''
    const countStr = clean[countCol]

    if (!productId || !countStr) continue
    const physicalCount = parseFloat(countStr)
    if (isNaN(physicalCount)) continue

    rows.push({ productId, binLocation, physicalCount, rawRow: clean })
  }

  if (rows.length === 0) return NextResponse.json({ error: 'No valid data rows found in CSV' }, { status: 400 })

  const comparison = compareWithFinale(rows)
  const compId = saveComparison(comparison, file.name, 'CSV', countedBy)

  return NextResponse.json({ id: compId, ...comparison })
}
