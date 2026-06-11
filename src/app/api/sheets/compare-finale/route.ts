import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

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

  const db = getDb()

  // Load from finale_stock_csv (pure Stock: QoH from Finale export, no transfer data)
  let syncedAt: string | null = null
  const finaleByBin  = new Map<string, { qoh: number; name: string }>() // "pid::bin" -> qoh
  const finaleByPid  = new Map<string, { qoh: number; name: string }>() // "pid" -> total qoh fallback

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS finale_stock_csv (
        product_id   TEXT NOT NULL,
        bin_location TEXT NOT NULL DEFAULT '',
        product_name TEXT,
        qoh          REAL NOT NULL DEFAULT 0,
        imported_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (product_id, bin_location)
      )
    `)

    const rows = db.prepare(`SELECT product_id, bin_location, product_name, qoh, imported_at FROM finale_stock_csv`).all() as
      { product_id: string; bin_location: string; product_name: string; qoh: number; imported_at: string }[]

    if (rows.length === 0) {
      return NextResponse.json({
        error: 'No Finale stock data found. Drop your Finale export CSV in the "Finale Stock Data" box first.'
      }, { status: 400 })
    }

    syncedAt = rows[0].imported_at

    for (const r of rows) {
      const name = r.product_name || r.product_id
      if (r.bin_location) {
        finaleByBin.set(`${r.product_id}::${r.bin_location}`, { qoh: r.qoh, name })
      }
      // Accumulate product total for fallback
      const ex = finaleByPid.get(r.product_id)
      if (ex) { ex.qoh += r.qoh } else { finaleByPid.set(r.product_id, { qoh: r.qoh, name }) }
    }
  } catch {
    return NextResponse.json({ error: 'Could not read Finale stock data. Upload your Finale CSV first.' }, { status: 500 })
  }

  // Parse physical count CSV — reject Excel files early
  const physName = physicalFile.name.toLowerCase()
  if (physName.endsWith('.xlsx') || physName.endsWith('.xls')) {
    return NextResponse.json({
      error: 'Excel files (.xlsx/.xls) are not supported. Please export/save your physical count as a CSV file.'
    }, { status: 400 })
  }
  const physBytes = await physicalFile.arrayBuffer()
  const physMagic = new Uint8Array(physBytes.slice(0, 4))
  if (physMagic[0] === 0x50 && physMagic[1] === 0x4B) {
    return NextResponse.json({
      error: 'The physical count file appears to be an Excel/ZIP file, not a CSV. Please export/save as CSV format.'
    }, { status: 400 })
  }
  const { headers: ph, rows: pr } = parseCSV(new TextDecoder().decode(physBytes))
  const pPidCol   = findCol(ph, 'product id', 'product_id', 'productid', 'sku', 'item')
  const pCountCol = findCol(ph, 'count', 'qty', 'quantity', 'physical', 'actual')
  const pBinCol   = findCol(ph, 'bin', 'location', 'rack', 'sublocation')

  if (pPidCol === -1) return NextResponse.json({ error: `Missing Product ID column. Found: [${ph.join(', ')}]` }, { status: 400 })
  if (pCountCol === -1) return NextResponse.json({ error: `Missing count column. Found: [${ph.join(', ')}]` }, { status: 400 })

  // Build physical rows
  interface PhysRow { count: number; bin: string }
  const physicalMap = new Map<string, PhysRow>()
  for (const row of pr) {
    const pid = row[pPidCol]?.trim()
    if (!pid) continue
    const bin = pBinCol >= 0 ? (row[pBinCol]?.trim() || '') : ''
    const count = parseFloat(row[pCountCol]?.replace(/,/g, '').trim())
    if (isNaN(count)) continue
    const key = `${pid}::${bin}`
    const ex = physicalMap.get(key)
    if (ex) { ex.count += count } else { physicalMap.set(key, { count, bin }) }
  }

  // Determine if Finale CSV has any bin-level data
  const finaleHasBins = finaleByBin.size > 0

  // Compare bin-for-bin — no fallback to product total when bin is specified
  type Status = 'match' | 'variance' | 'not_in_finale' | 'not_counted' | 'bin_not_in_finale'
  interface Line {
    productId: string; productName: string; binLocation: string
    finaleQty: number; physicalCount: number; variance: number; variancePct: number; status: Status
  }
  const lines: Line[] = []

  for (const [key, { count: physCount, bin }] of physicalMap) {
    const pid = key.split('::')[0]

    // If bin specified and Finale has bin data → match exact bin only, no total fallback
    // If bin specified but Finale has NO bin data at all → fall back to product total (old CSV without sublocations)
    // If no bin specified → use product total
    let finale: { qoh: number; name: string } | undefined
    if (bin && finaleHasBins) {
      finale = finaleByBin.get(`${pid}::${bin}`)
    } else {
      finale = (bin ? finaleByBin.get(`${pid}::${bin}`) : undefined) ?? finaleByPid.get(pid)
    }

    // If bin was specified, Finale has bin data, but this exact bin isn't in Finale → flag it
    if (bin && finaleHasBins && !finale) {
      const productName = finaleByPid.get(pid)?.name || pid
      lines.push({ productId: pid, productName, binLocation: bin, finaleQty: 0, physicalCount: physCount, variance: physCount, variancePct: 100, status: 'bin_not_in_finale' })
      continue
    }

    const finaleQty = finale ? Math.round(finale.qoh) : 0
    const productName = finale?.name || pid
    const variance = physCount - finaleQty
    const variancePct = finaleQty !== 0
      ? Math.round((variance / Math.abs(finaleQty)) * 1000) / 10
      : (physCount > 0 ? 100 : 0)

    let status: Status = 'match'
    if (finaleQty === 0 && physCount > 0) status = 'not_in_finale'
    else if (variance !== 0) status = 'variance'

    lines.push({ productId: pid, productName, binLocation: bin, finaleQty, physicalCount: physCount, variance, variancePct, status })
  }

  const order = { variance: 0, bin_not_in_finale: 1, not_in_finale: 2, match: 3, not_counted: 4 }
  lines.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.variance) - Math.abs(a.variance))

  const matched         = lines.filter(l => l.status === 'match').length
  const variances       = lines.filter(l => l.status === 'variance').length
  const notInFinale     = lines.filter(l => l.status === 'not_in_finale').length
  const totalVarianceUnits = lines.reduce((s, l) => s + Math.abs(l.variance), 0)

  return NextResponse.json({
    lines,
    syncedAt,
    summary: { totalLines: lines.length, matched, variances, notInFinale, notCounted: 0, totalVarianceUnits },
    importedAt: new Date().toISOString(),
  })
}
