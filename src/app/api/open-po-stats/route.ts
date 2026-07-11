import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()
    db.exec(`CREATE TABLE IF NOT EXISTS open_po_cache (key TEXT PRIMARY KEY, value TEXT)`)
    const rows = db.prepare(`SELECT key, value FROM open_po_cache`).all() as { key: string; value: string }[]
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
    return NextResponse.json({
      totalValue: parseFloat(map.total_value ?? '0') || 0,
      poCount:    parseInt(map.po_count ?? '0') || 0,
      updatedAt:  map.updated_at ?? null,
    })
  } catch {
    return NextResponse.json({ totalValue: 0, poCount: 0, updatedAt: null })
  }
}
