import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: get a validation session with all counts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const session = db.prepare(`SELECT * FROM validation_sessions WHERE id = ?`).get(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const counts = db.prepare(`
    SELECT * FROM validation_counts WHERE session_id = ? ORDER BY product_name
  `).all(id)

  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'counted' THEN 1 ELSE 0 END) AS counted,
      SUM(CASE WHEN status = 'counted' AND variance = 0 THEN 1 ELSE 0 END) AS matched,
      SUM(CASE WHEN status = 'counted' AND variance != 0 THEN 1 ELSE 0 END) AS variances
    FROM validation_counts WHERE session_id = ?
  `).get(id) as { total: number; counted: number; matched: number; variances: number }

  return NextResponse.json({ session, counts, summary })
}

// PATCH: update session status or submit a hand count for an item
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()

  // Update a specific count line
  if (body.count_id !== undefined) {
    const handCount = parseFloat(body.hand_count)
    const count = db.prepare(`SELECT * FROM validation_counts WHERE id = ? AND session_id = ?`).get(body.count_id, id) as { expected_qty: number } | undefined
    if (!count) return NextResponse.json({ error: 'Count line not found' }, { status: 404 })

    const variance = handCount - count.expected_qty
    db.prepare(`
      UPDATE validation_counts
      SET hand_count = ?, variance = ?, status = 'counted', counted_at = datetime('now'), notes = ?
      WHERE id = ?
    `).run(handCount, variance, body.notes ?? null, body.count_id)

    // If variance, auto-create a discrepancy
    if (variance !== 0) {
      const session = db.prepare(`SELECT * FROM validation_sessions WHERE id = ?`).get(id) as { facility_name: string; counted_by: string }
      const countLine = db.prepare(`SELECT * FROM validation_counts WHERE id = ?`).get(body.count_id) as { product_id: string; product_name: string; expected_qty: number }

      // Check for existing unresolved discrepancy for same product+bin
      const existing = db.prepare(`
        SELECT id FROM discrepancies
        WHERE sku = ? AND bin_location = ? AND status != 'resolved'
      `).get(countLine.product_id, session.facility_name)

      if (!existing) {
        const discType = variance < 0 ? 'short_shipped' : 'over_shipped'
        const priority = Math.abs(variance) > 50 ? 'critical' : Math.abs(variance) > 10 ? 'high' : 'medium'

        const discResult = db.prepare(`
          INSERT INTO discrepancies
            (order_number, sku, bin_location, expected_qty, shipped_qty,
             discrepancy_type, status, priority, source)
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'Hand Count Validation')
        `).run(
          `VAL-${id}`, countLine.product_id, session.facility_name,
          countLine.expected_qty, handCount, discType, priority
        )

        db.prepare(`
          INSERT INTO audit_log (discrepancy_id, actor_name, action, from_value, to_value)
          VALUES (?, ?, 'created', ?, ?)
        `).run(
          discResult.lastInsertRowid, session.counted_by,
          `Expected: ${countLine.expected_qty}`,
          `Counted: ${handCount} (variance: ${variance > 0 ? '+' : ''}${variance})`
        )

        db.prepare(`
          INSERT INTO notes (discrepancy_id, author_name, body)
          VALUES (?, ?, ?)
        `).run(
          discResult.lastInsertRowid, session.counted_by,
          `Auto-created from validation session #${id}.\n` +
          `Product: ${countLine.product_name} (${countLine.product_id})\n` +
          `Bin: ${session.facility_name}\n` +
          `Finale expected: ${countLine.expected_qty}\n` +
          `Hand count: ${handCount}\n` +
          `Variance: ${variance > 0 ? '+' : ''}${variance}\n` +
          (body.notes ? `Counter notes: ${body.notes}` : '')
        )
      }
    }

    return NextResponse.json({ ok: true, variance })
  }

  // Complete the session
  if (body.status === 'completed') {
    db.prepare(`
      UPDATE validation_sessions SET status = 'completed', completed_at = datetime('now'), notes = ?
      WHERE id = ?
    `).run(body.notes ?? null, id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
}
