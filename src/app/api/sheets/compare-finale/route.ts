import { NextRequest, NextResponse } from 'next/server'
import { fetchInventoryLevels, fetchProducts } from '@/lib/finale'

export const dynamic = 'force-dynamic'

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    result.push(cur.trim())
    return result
  }
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(l => parseLine(l).map(c => c.replace(/^"|"$/g, '').trim()))
  return { headers, rows }
}

function findCol(headers: string[], ...keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.includes(k)))
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const physicalFile = formData.get('physicalFile') as File | null
  const countedBy = (formData.get('countedBy') as string) || 'Physical Count'

  if (!physicalFile) {
    return NextResponse.json({ error: 'Physical count file is required' }, { status: 400 })
  }

  // Fetch Finale inventory levels + product names directly from API
  let finaleMap: Map<string, { qoh: number; name: string }>
  try {
    const [levels, products] = await Promise.all([fetchInventoryLevels(), fetchProducts()])
    const nameMap = new Map(products.map(p => [p.productId, p.internalName || p.productId]))

    // Sum QoH across all bin locations per product
    finaleMap = new Map()
    for (const l of levels) {
      const pid = l.productId?.trim()
      if (!pid) continue
      const qty = Number(l.qtyOnHand ?? 0)
      if (qty === 0) continue
      const existing = finaleMap.get(pid)
      if (existing) {
        existing.qoh += qty
      } else {
        finaleMap.set(pid, { qoh: qty, name: nameMap.get(pid) || pid })
      }
    }
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch Finale data: ${(err as Error).message}` }, { status: 500 })
  }

  // Parse physical count CSV
  const { headers: ph, rows: pr } = parseCSV(await physicalFile.text())
  const pPidCol = findCol(ph, 'product id', 'product_id', 'productid', 'sku', 'item')
  const pCountCol = findCol(ph, 'count', 'qty', 'quantity', 'physical', 'actual')
  const pBinCol = findCol(ph, 'bin', 'location', 'rack')

  if (pPidCol === -1) return NextResponse.json({ error: `Physical count CSV missing Product ID column. Found: [${ph.join(', ')}]` }, { status: 400 })
  if (pCountCol === -1) return NextResponse.json({ error: `Physical count CSV missing count column. Found: [${ph.join(', ')}]` }, { status: 400 })

  // Build physical map — sum all bins per product
  const physicalMap = new Map<string, { total: number; bins: string[] }>()
  for (const row of pr) {
    const pid = row[pPidCol]?.trim()
    if (!pid) continue
    const bin = pBinCol >= 0 ? (row[pBinCol]?.trim() || '') : ''
    const count = parseFloat(row[pCountCol]?.replace(/,/g, '').trim())
    if (isNaN(count)) continue
    const existing = physicalMap.get(pid)
    if (existing) {
      existing.total += count
      if (bin && !existing.bins.includes(bin)) existing.bins.push(bin)
    } else {
      physicalMap.set(pid, { total: count, bins: bin ? [bin] : [] })
    }
  }

  // Build comparison lines
  type Status = 'match' | 'variance' | 'not_in_finale' | 'not_counted'
  interface Line {
    productId: string; productName: string; binLocation: string
    finaleQty: number; physicalCount: number; variance: number; variancePct: number; status: Status
  }
  const lines: Line[] = []

  for (const [pid, { total: physCount, bins }] of physicalMap) {
    const finale = finaleMap.get(pid)
    const finaleQty = finale ? Math.round(finale.qoh) : 0
    const productName = finale?.name || pid
    const variance = physCount - finaleQty
    const variancePct = finaleQty !== 0 ? Math.round((variance / Math.abs(finaleQty)) * 1000) / 10 : (physCount > 0 ? 100 : 0)
    let status: Status = 'match'
    if (finaleQty === 0 && physCount > 0) status = 'not_in_finale'
    else if (variance !== 0) status = 'variance'
    lines.push({ productId: pid, productName, binLocation: bins.join(', '), finaleQty, physicalCount: physCount, variance, variancePct, status })
  }

  const order = { variance: 0, not_in_finale: 1, match: 2, not_counted: 3 }
  lines.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.variance) - Math.abs(a.variance))

  const matched = lines.filter(l => l.status === 'match').length
  const variances = lines.filter(l => l.status === 'variance').length
  const notInFinale = lines.filter(l => l.status === 'not_in_finale').length
  const totalVarianceUnits = lines.reduce((s, l) => s + Math.abs(l.variance), 0)

  return NextResponse.json({
    lines,
    summary: { totalLines: lines.length, matched, variances, notInFinale, notCounted: 0, totalVarianceUnits },
    importedAt: new Date().toISOString(),
  })
}
