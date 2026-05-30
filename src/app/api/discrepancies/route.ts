import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getDb()
  const { searchParams } = new URL(req.url)

  const status   = searchParams.get('status')
  const priority = searchParams.get('priority')
  const q        = searchParams.get('q')
  const page     = parseInt(searchParams.get('page') || '1')
  const limit    = 20
  const offset   = (page - 1) * limit

  const conditions: string[] = []
  const params: (string | number)[] = []

  const bin = searchParams.get('bin')

  if (status && status !== 'all')     { conditions.push('d.status = ?');   params.push(status) }
  if (priority && priority !== 'all') { conditions.push('d.priority = ?'); params.push(priority) }
  if (bin)                            { conditions.push('d.bin_location = ?'); params.push(bin) }
  if (q) {
    conditions.push('(d.sku LIKE ? OR d.order_number LIKE ? OR d.bin_location LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const total = (db.prepare(`SELECT COUNT(*) as c FROM discrepancies d ${where}`).get(...params) as { c: number }).c

  const rows = db.prepare(`
    SELECT d.*, u.name AS assigned_name,
           (SELECT COUNT(*) FROM notes n WHERE n.discrepancy_id = d.id) AS note_count
    FROM discrepancies d
    LEFT JOIN users u ON u.id = d.assigned_to
    ${where}
    ORDER BY
      CASE d.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      d.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return NextResponse.json({ rows, total, page, limit })
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const body = await req.json()

  const { order_number, sku, bin_location, expected_qty, shipped_qty,
          discrepancy_type, priority, assigned_to, source } = body

  const result = db.prepare(`
    INSERT INTO discrepancies
      (order_number, sku, bin_location, expected_qty, shipped_qty,
       discrepancy_type, priority, assigned_to, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order_number, sku, bin_location, expected_qty, shipped_qty,
         discrepancy_type, priority || 'medium', assigned_to ?? null, source ?? null)

  db.prepare(`
    INSERT INTO audit_log (discrepancy_id, actor_name, action, to_value)
    VALUES (?, ?, 'created', ?)
  `).run(result.lastInsertRowid, body.actor || 'System', discrepancy_type)

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
}
