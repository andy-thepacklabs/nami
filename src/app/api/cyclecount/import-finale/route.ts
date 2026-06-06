import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST: bulk-import all Finale stock from Racks A–J into cycle_count_lines
// Creates one cycle_count session per bin, pre-populated with Finale qty_on_hand.
// If a bin already has an in_progress session it is reused; completed ones are skipped.
export async function POST(req: NextRequest) {
  const db = getDb()
  const body = await req.json()
  const counted_by: string = body.counted_by || 'Finale Import'
  const racks: string = body.racks || 'ABCDEFGHIJ'

  // Build LIKE patterns for each rack letter
  const rackLetters = racks.toUpperCase().split('').filter(c => /[A-Z]/.test(c))
  if (rackLetters.length === 0) {
    return NextResponse.json({ error: 'No valid rack letters provided' }, { status: 400 })
  }

  // Fetch all stock rows for the requested racks from the local DB
  const placeholders = rackLetters.map(() => "f.facility_name LIKE ?").join(' OR ')
  const params = rackLetters.map(r => `SFS-${r}-%`)

  let stockRows: { product_id: string; lookup_code: string | null; description: string | null; facility_name: string; qty_on_hand: number }[]
  try {
    stockRows = db.prepare(`
      SELECT s.product_id,
             p.lookup_code,
             p.description,
             f.facility_name,
             COALESCE(s.qty_on_hand, 0) AS qty_on_hand
      FROM finale_stock s
      LEFT JOIN finale_products p ON p.product_id = s.product_id
      LEFT JOIN finale_facilities f ON f.facility_id = s.facility_id
      WHERE (${placeholders})
        AND f.facility_name LIKE 'SFS-_-__-__-%'
        AND f.status != 'FACILITY_INACTIVE'
        AND COALESCE(s.qty_on_hand, 0) > 0
      ORDER BY f.facility_name, p.lookup_code
    `).all(...params) as typeof stockRows
  } catch {
    return NextResponse.json({ error: 'No synced Finale data — run a Finale sync first' }, { status: 400 })
  }

  if (stockRows.length === 0) {
    return NextResponse.json({ error: 'No stock found in Finale for the selected racks. Make sure you have synced Finale data first.' }, { status: 400 })
  }

  // Group by bin
  const byBin = new Map<string, typeof stockRows>()
  for (const row of stockRows) {
    if (!byBin.has(row.facility_name)) byBin.set(row.facility_name, [])
    byBin.get(row.facility_name)!.push(row)
  }

  const insertCount = db.prepare(`
    INSERT INTO cycle_counts (bin_name, counted_by, count_type, status)
    VALUES (?, ?, 'finale_import', 'in_progress')
  `)
  const insertLine = db.prepare(`
    INSERT INTO cycle_count_lines (count_id, product_id, product_name, quantity)
    VALUES (?, ?, ?, ?)
  `)
  const existingInProgress = db.prepare(`
    SELECT id FROM cycle_counts
    WHERE bin_name = ? AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1
  `)
  const deleteLines = db.prepare(`DELETE FROM cycle_count_lines WHERE count_id = ?`)

  let binsCreated = 0
  let binsReused = 0
  let linesImported = 0

  const importAll = db.transaction(() => {
    for (const [bin, rows] of byBin) {
      const existing = existingInProgress.get(bin) as { id: number } | undefined
      let countId: number

      if (existing) {
        // Reuse and refresh existing in-progress session
        deleteLines.run(existing.id)
        countId = existing.id
        binsReused++
      } else {
        const res = insertCount.run(bin, counted_by)
        countId = res.lastInsertRowid as number
        binsCreated++
      }

      for (const row of rows) {
        insertLine.run(countId, row.product_id, row.description || row.lookup_code || row.product_id, row.qty_on_hand)
        linesImported++
      }
    }
  })

  importAll()

  return NextResponse.json({
    ok: true,
    binsCreated,
    binsReused,
    linesImported,
    totalBins: byBin.size,
  })
}

// GET: preview how many bins/lines would be imported
export async function GET(req: NextRequest) {
  const db = getDb()
  const racks = (new URL(req.url).searchParams.get('racks') || 'ABCDEFGHIJ').toUpperCase()
  const rackLetters = racks.split('').filter(c => /[A-Z]/.test(c))
  const placeholders = rackLetters.map(() => "f.facility_name LIKE ?").join(' OR ')
  const params = rackLetters.map(r => `SFS-${r}-%`)

  try {
    const summary = db.prepare(`
      SELECT COUNT(DISTINCT f.facility_name) AS bins,
             COUNT(*) AS lines
      FROM finale_stock s
      LEFT JOIN finale_products p ON p.product_id = s.product_id
      LEFT JOIN finale_facilities f ON f.facility_id = s.facility_id
      WHERE (${placeholders})
        AND f.facility_name LIKE 'SFS-_-__-__-%'
        AND f.status != 'FACILITY_INACTIVE'
        AND COALESCE(s.qty_on_hand, 0) > 0
    `).get(...params) as { bins: number; lines: number }
    return NextResponse.json(summary)
  } catch {
    return NextResponse.json({ bins: 0, lines: 0, error: 'No synced data' })
  }
}
