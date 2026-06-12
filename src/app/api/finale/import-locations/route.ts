import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  db.exec(`CREATE TABLE IF NOT EXISTS active_locations (bin_location TEXT PRIMARY KEY, imported_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  const rows = db.prepare(`SELECT bin_location FROM active_locations ORDER BY bin_location`).all() as { bin_location: string }[]
  return NextResponse.json({ count: rows.length, bins: rows.map(r => r.bin_location) })
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })

  // Parse headers
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())

  // Find the bin/sublocation name column — prefer 'sublocation' over generic 'location'
  let nameCol = headers.findIndex(h => /sublocation/i.test(h))
  if (nameCol === -1) nameCol = headers.findIndex(h => /^bin$|bin location/i.test(h))
  if (nameCol === -1) nameCol = headers.findIndex(h => /location|name/i.test(h))
  const statusCol = headers.findIndex(h => /status/i.test(h))

  if (nameCol === -1) return NextResponse.json({ error: `Could not find a name column. Found: [${headers.join(', ')}]` }, { status: 400 })

  const activeBins: string[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim())
    const name = cols[nameCol]?.trim()
    if (!name) continue
    // If status column exists, only keep active ones
    if (statusCol !== -1) {
      const status = (cols[statusCol] || '').trim().toLowerCase()
      if (status.includes('inactive') || status === 'false' || status === '0') continue
    }
    activeBins.push(name)
  }

  if (activeBins.length === 0) return NextResponse.json({ error: 'No active bin locations found in CSV' }, { status: 400 })

  const db = getDb()
  db.exec(`CREATE TABLE IF NOT EXISTS active_locations (bin_location TEXT PRIMARY KEY, imported_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  db.exec(`DELETE FROM active_locations`)
  const ins = db.prepare(`INSERT OR REPLACE INTO active_locations (bin_location) VALUES (?)`)
  db.exec('BEGIN')
  try {
    for (const bin of activeBins) ins.run(bin)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return NextResponse.json({ error: `Insert failed: ${e}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, imported: activeBins.length })
}
