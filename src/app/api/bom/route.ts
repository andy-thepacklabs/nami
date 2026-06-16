import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureTable() {
  const db = getDb()
  db.exec(`CREATE TABLE IF NOT EXISTS bom_entries (
    parent_id  TEXT NOT NULL,
    child_id   TEXT NOT NULL,
    bom_qty    REAL NOT NULL,
    PRIMARY KEY (parent_id, child_id)
  )`)
  return db
}

export async function GET() {
  try {
    const db = ensureTable()
    const rows = db.prepare(`SELECT parent_id, child_id, bom_qty FROM bom_entries ORDER BY parent_id, child_id`).all() as {
      parent_id: string; child_id: string; bom_qty: number
    }[]
    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ rows: [], error: String(err) })
  }
}

export async function POST(req: Request) {
  try {
    const { entries } = await req.json() as { entries: { sku: string; component: string; qty: number }[] }
    if (!Array.isArray(entries) || entries.length === 0)
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 })

    const db = ensureTable()
    db.exec('DROP TABLE IF EXISTS bom_entries')
    db.exec(`CREATE TABLE bom_entries (
      parent_id TEXT NOT NULL, child_id TEXT NOT NULL, bom_qty REAL NOT NULL,
      PRIMARY KEY (parent_id, child_id)
    )`)
    const insert = db.prepare(`INSERT INTO bom_entries (parent_id, child_id, bom_qty) VALUES (?, ?, ?)`)
    for (const r of entries) insert.run(r.sku, r.component, r.qty)
    return NextResponse.json({ saved: entries.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
