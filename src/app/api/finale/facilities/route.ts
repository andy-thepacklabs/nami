import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getDb()
  const q = new URL(req.url).searchParams.get('q')

  try {
    if (q) {
      const rows = db.prepare(`
        SELECT facility_id, facility_name, facility_type, status, parent_url, synced_at
        FROM finale_facilities
        WHERE facility_id LIKE ? OR facility_name LIKE ?
        ORDER BY facility_name LIMIT 100
      `).all(`%${q}%`, `%${q}%`)
      return NextResponse.json({ rows, total: rows.length })
    }

    const rows = db.prepare(`
      SELECT facility_id, facility_name, facility_type, status, parent_url, synced_at
      FROM finale_facilities
      ORDER BY facility_name LIMIT 100
    `).all()
    const total = (db.prepare(`SELECT COUNT(*) as c FROM finale_facilities`).get() as { c: number }).c
    return NextResponse.json({ rows, total })
  } catch {
    return NextResponse.json({ rows: [], total: 0, error: 'No synced data yet — run a sync first' })
  }
}
