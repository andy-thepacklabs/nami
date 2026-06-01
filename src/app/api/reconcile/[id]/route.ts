import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const session = db.prepare('SELECT * FROM reconcile_sessions WHERE id = ?').get(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lines = db.prepare('SELECT * FROM reconcile_lines WHERE session_id = ? ORDER BY product_name, product_id').all(id)

  return NextResponse.json({ session, lines })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()

  const session = db.prepare('SELECT * FROM reconcile_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Add a count line
  if (body.action === 'add_line') {
    const existing = db.prepare('SELECT id FROM reconcile_lines WHERE session_id = ? AND product_id = ?').get(id, body.product_id)
    if (existing) {
      db.prepare('UPDATE reconcile_lines SET hand_count = ?, product_name = COALESCE(?, product_name) WHERE session_id = ? AND product_id = ?')
        .run(Number(body.hand_count ?? 0), body.product_name ?? null, id, body.product_id)
    } else {
      db.prepare('INSERT INTO reconcile_lines (session_id, product_id, product_name, hand_count) VALUES (?, ?, ?, ?)')
        .run(id, body.product_id, body.product_name ?? null, Number(body.hand_count ?? 0))
    }
    return NextResponse.json({ ok: true })
  }

  // Bulk add
  if (body.action === 'bulk_add') {
    for (const l of body.lines) {
      const existing = db.prepare('SELECT id FROM reconcile_lines WHERE session_id = ? AND product_id = ?').get(id, l.product_id)
      if (existing) {
        db.prepare('UPDATE reconcile_lines SET hand_count = ?, product_name = COALESCE(?, product_name) WHERE session_id = ? AND product_id = ?')
          .run(Number(l.hand_count ?? 0), l.product_name ?? null, id, l.product_id)
      } else {
        db.prepare('INSERT INTO reconcile_lines (session_id, product_id, product_name, hand_count) VALUES (?, ?, ?, ?)')
          .run(id, l.product_id, l.product_name ?? null, Number(l.hand_count ?? 0))
      }
    }
    return NextResponse.json({ ok: true })
  }

  // Move to compare step — pull Finale numbers and compute variance
  if (body.action === 'compare') {
    const binName = session.bin_name as string
    const lines = db.prepare('SELECT * FROM reconcile_lines WHERE session_id = ?').all(id) as { id: number; product_id: string; hand_count: number }[]

    for (const line of lines) {
      const stock = db.prepare('SELECT net_qty FROM computed_stock WHERE product_id = ? AND facility_name = ?').get(line.product_id, binName) as { net_qty: number } | undefined
      const finaleQty = stock ? Math.round(stock.net_qty) : 0
      const variance = line.hand_count - finaleQty
      db.prepare('UPDATE reconcile_lines SET finale_qty = ?, variance = ? WHERE id = ?').run(finaleQty, variance, line.id)
    }

    // Also check for products Finale thinks are here but weren't counted
    const finaleStock = db.prepare('SELECT product_id, product_name, net_qty FROM computed_stock WHERE facility_name = ?').all(binName) as { product_id: string; product_name: string; net_qty: number }[]
    const countedProducts = new Set(lines.map(l => l.product_id))
    for (const fs of finaleStock) {
      if (!countedProducts.has(fs.product_id) && Math.round(fs.net_qty) !== 0) {
        db.prepare('INSERT INTO reconcile_lines (session_id, product_id, product_name, hand_count, finale_qty, variance) VALUES (?, ?, ?, 0, ?, ?)')
          .run(id, fs.product_id, fs.product_name, Math.round(fs.net_qty), -Math.round(fs.net_qty))
      }
    }

    db.prepare("UPDATE reconcile_sessions SET status = 'comparing' WHERE id = ?").run(id)
    return NextResponse.json({ ok: true })
  }

  // Resolve a line — accept hand count, accept finale, or enter custom
  if (body.action === 'resolve_line') {
    db.prepare(`
      UPDATE reconcile_lines
      SET resolution = ?, resolved_qty = ?, resolved_by = ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(body.resolution, Number(body.resolved_qty), body.resolved_by || session.counted_by, body.line_id)
    return NextResponse.json({ ok: true })
  }

  // Complete the whole session
  if (body.action === 'complete') {
    db.prepare("UPDATE reconcile_sessions SET status = 'resolved', completed_at = datetime('now'), notes = ? WHERE id = ?")
      .run(body.notes ?? null, id)
    return NextResponse.json({ ok: true })
  }

  // Delete a line
  if (body.action === 'delete_line') {
    db.prepare('DELETE FROM reconcile_lines WHERE id = ? AND session_id = ?').run(body.line_id, id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
