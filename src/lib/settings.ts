import { getDb } from './db'

export function getSetting(key: string): string | null {
  const db = getDb()
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  } catch {
    return null
  }
}

export function getGoogleServiceAccountJson(): string {
  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON || getSetting('google_service_account_json') || ''
}

export function getGoogleSheetId(): string {
  return process.env.GOOGLE_SHEET_ID || getSetting('google_sheet_id') || ''
}

export function getGoogleSheetTab(): string {
  return getSetting('google_sheet_tab') || 'Sheet1'
}
