import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const disc = db.prepare(`
    SELECT d.*, u.name AS assigned_name
    FROM discrepancies d
    LEFT JOIN users u ON u.id = d.assigned_to
    WHERE d.id = ?
  `).get(id)

  if (!disc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const notes = db.prepare(`SELECT * FROM notes WHERE discrepancy_id = ? ORDER BY created_at ASC`).all(id)
  const audit = db.prepare(`SELECT * FROM audit_log WHERE discrepancy_id = ? ORDER BY created_at ASC`).all(id)
  const users = db.prepare(`SELECT id, name, role FROM users ORDER BY name`).all()

  return NextResponse.json({ disc, notes, audit, users })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()

  const disc = db.prepare('SELECT * FROM discrepancies WHERE id = ?').get(id) as Record<string, unknown>
  if (!disc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowed = ['status', 'priority', 'assigned_to']
  const updates: string[] = []
  const vals: (string | number | null)[] = []

  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`)
      vals.push(body[key] as string | number | null)
    }
  }
  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  updates.push("updated_at = datetime('now')")
  if (body.status === 'resolved') updates.push("resolved_at = datetime('now')")

  db.prepare(`UPDATE discrepancies SET ${updates.join(', ')} WHERE id = ?`).run(...vals, id)

  const actor = body.actor || 'Unknown'
  for (const key of allowed) {
    if (key in body && body[key] !== disc[key]) {
      db.prepare(`
        INSERT INTO audit_log (discrepancy_id, actor_name, action, from_value, to_value)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, actor, `${key}_change`, String(disc[key] ?? ''), String(body[key]))
    }
  }

  return NextResponse.json({ ok: true })
}
