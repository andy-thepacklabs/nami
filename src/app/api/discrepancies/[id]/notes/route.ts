import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const db = getDb()
  const id = parseInt(idStr)
  const body = await req.json()

  const { author_name, body: noteBody, photo_url } = body
  if (!author_name || !noteBody) {
    return NextResponse.json({ error: 'author_name and body required' }, { status: 400 })
  }

  const result = db.prepare(`
    INSERT INTO notes (discrepancy_id, author_name, body, photo_url)
    VALUES (?, ?, ?, ?)
  `).run(id, author_name, noteBody, photo_url ?? null)

  db.prepare(`
    INSERT INTO audit_log (discrepancy_id, actor_name, action)
    VALUES (?, ?, 'note_added')
  `).run(id, author_name)

  db.prepare(`UPDATE discrepancies SET updated_at = datetime('now') WHERE id = ?`).run(id)

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
}
