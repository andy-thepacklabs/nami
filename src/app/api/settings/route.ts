import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const ENV_PATH = path.resolve(process.cwd(), '.env.local')

// Keys that should be written to .env.local instead of the DB
const ENV_KEYS: Record<string, string> = {
  finale_account: 'FINALE_ACCOUNT',
  finale_username: 'FINALE_USERNAME',
  finale_password: 'FINALE_PASSWORD',
}

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

function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {}
  const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n')
  const map: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    map[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return map
}

function writeEnvFile(vars: Record<string, string>) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`)
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8')
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

  // Show env vars status (without exposing values)
  settings._env_finale_account = process.env.FINALE_ACCOUNT ? 'set' : ''
  settings._env_finale_username = process.env.FINALE_USERNAME ? 'set' : ''
  settings._env_finale_password = process.env.FINALE_PASSWORD ? 'set' : ''
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

  // Separate env keys from DB keys
  const envUpdates: Record<string, string> = {}

  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith('_')) continue
    if (ENV_KEYS[key]) {
      // Write to .env.local
      envUpdates[ENV_KEYS[key]] = value
      // Also update process.env so it takes effect immediately (without restart)
      process.env[ENV_KEYS[key]] = value
    } else {
      upsert.run(key, value)
    }
  }

  if (Object.keys(envUpdates).length > 0) {
    const current = readEnvFile()
    const updated = { ...current, ...envUpdates }
    writeEnvFile(updated)
  }

  return NextResponse.json({ ok: true })
}
