import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureTable() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  return db
}

export async function GET() {
  const db = ensureTable()

  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const r of rows) {
    if (r.key === 'google_service_account_json') {
      settings[r.key] = r.value ? '••• configured •••' : ''
    } else {
      settings[r.key] = r.value
    }
  }

  // Also show env vars status (without exposing values)
  settings._env_finale_account = process.env.FINALE_ACCOUNT ? 'set' : ''
  settings._env_google_json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'set' : ''
  settings._env_sheet_id = process.env.GOOGLE_SHEET_ID || ''

  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  const db = ensureTable()
  const body = await req.json() as Record<string, string>

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `)

  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('_')) continue
    upsert.run(key, value)
  }

  return NextResponse.json({ ok: true })
}
