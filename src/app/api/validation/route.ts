import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: list validation sessions
export async function GET() {
  const db = getDb()
  try {
    const rows = db.prepare(`
      SELECT vs.*,
             (SELECT COUNT(*) FROM validation_counts vc WHERE vc.session_id = vs.id) AS total_items,
             (SELECT COUNT(*) FROM validation_counts vc WHERE vc.session_id = vs.id AND vc.status = 'counted') AS counted_items,
             (SELECT COUNT(*) FROM validation_counts vc WHERE vc.session_id = vs.id AND vc.variance != 0 AND vc.status = 'counted') AS variance_items
      FROM validation_sessions vs
      ORDER BY vs.started_at DESC
      LIMIT 50
    `).all()
    return NextResponse.json({ rows })
  } catch {
    return NextResponse.json({ rows: [] })
  }
}

// POST: start a new validation session for a bin
export async function POST(req: NextRequest) {
  const db = getDb()
  const body = await req.json()
  const { facility_url, facility_name, counted_by } = body

  if (!facility_url || !counted_by) {
    return NextResponse.json({ error: 'facility_url and counted_by required' }, { status: 400 })
  }

  // Create session
  const result = db.prepare(`
    INSERT INTO validation_sessions (facility_url, facility_name, counted_by)
    VALUES (?, ?, ?)
  `).run(facility_url, facility_name || facility_url, counted_by)

  const sessionId = result.lastInsertRowid

  // Populate with expected stock for this bin
  try {
    const stock = db.prepare(`
      SELECT product_id, product_name, net_qty
      FROM computed_stock
      WHERE facility_url = ? AND net_qty > 0
      ORDER BY product_name
    `).all(facility_url) as { product_id: string; product_name: string; net_qty: number }[]

    const ins = db.prepare(`
      INSERT INTO validation_counts (session_id, product_id, product_name, expected_qty)
      VALUES (?, ?, ?, ?)
    `)
    for (const s of stock) {
      ins.run(sessionId, s.product_id, s.product_name, s.net_qty)
    }
  } catch {
    // No stock data for this bin — session will be empty
  }

  return NextResponse.json({ id: sessionId }, { status: 201 })
}
