'use client'

import { useState, useEffect } from 'react'
import {
  X, Settings, Save, CheckCircle2, AlertCircle, RefreshCw,
  Database, FileSpreadsheet, Key, ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testingSheets, setTestingSheets] = useState(false)
  const [sheetsResult, setSheetsResult] = useState<{ ok: boolean; sheetTitle?: string; rowCount?: number; headers?: string[]; error?: string } | null>(null)

  // Local form state
  const [googleJson, setGoogleJson] = useState('')
  const [sheetId, setSheetId] = useState('')
  const [sheetTab, setSheetTab] = useState('Sheet1')
  const [finaleAccount, setFinaleAccount] = useState('')
  const [finaleUsername, setFinaleUsername] = useState('')
  const [finalePassword, setFinalePassword] = useState('')
  const [testingFinale, setTestingFinale] = useState(false)
  const [finaleResult, setFinaleResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      setSettings(data)
      setSheetId(data.google_sheet_id || data._env_sheet_id || '')
      setSheetTab(data.google_sheet_tab || 'Sheet1')
      setLoading(false)
    })
  }, [])

  const saveFinale = async () => {
    setSaving(true)
    setSaved(false)
    const body: Record<string, string> = {}
    if (finaleAccount.trim()) body.finale_account = finaleAccount.trim()
    if (finaleUsername.trim()) body.finale_username = finaleUsername.trim()
    if (finalePassword.trim()) body.finale_password = finalePassword.trim()
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    const res = await fetch('/api/settings')
    const updated = await res.json()
    setSettings(updated)
    setFinaleAccount('')
    setFinaleUsername('')
    setFinalePassword('')
  }

  const testFinaleConnection = async () => {
    setTestingFinale(true)
    setFinaleResult(null)
    try {
      const res = await fetch('/api/finale/test-connection')
      const data = await res.json()
      setFinaleResult(data)
    } catch (err) {
      setFinaleResult({ ok: false, msg: (err as Error).message })
    }
    setTestingFinale(false)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)

    const body: Record<string, string> = {}
    if (googleJson.trim()) body.google_service_account_json = googleJson.trim()
    if (sheetId.trim()) body.google_sheet_id = sheetId.trim()
    body.google_sheet_tab = sheetTab.trim() || 'Sheet1'

    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)

    // Reload settings
    const res = await fetch('/api/settings')
    setSettings(await res.json())
  }

  const testSheets = async () => {
    setTestingSheets(true)
    setSheetsResult(null)
    const id = sheetId || settings.google_sheet_id || ''
    const res = await fetch(`/api/sheets?id=${encodeURIComponent(id)}`)
    setSheetsResult(await res.json())
    setTestingSheets(false)
  }

  if (loading) {
    return (
      <Shell onClose={onClose}>
        <div className="p-12 text-center text-orange-800 text-sm">Loading settings...</div>
      </Shell>
    )
  }

  const hasGoogleJson = settings.google_service_account_json === '••• configured •••' || settings._env_google_json === 'set'
  const hasSheetId = !!(sheetId || settings.google_sheet_id)

  return (
    <Shell onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-orange-900/30">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-orange-500" />
          <h2 className="font-bold text-white uppercase tracking-wide text-sm">Settings</h2>
        </div>
        <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

        {/* Finale Credentials */}
        <Section icon={<Database className="w-4 h-4" />} title="Finale Inventory" status={settings._env_finale_account === 'set' ? 'connected' : 'not configured'}>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-1.5">Account Name</label>
              <input
                className="input w-full"
                placeholder={settings._env_finale_account === 'set' ? '••• configured •••' : 'e.g. deltamunchies'}
                value={finaleAccount}
                onChange={e => setFinaleAccount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-1.5">API Username</label>
              <input
                className="input w-full"
                placeholder={settings._env_finale_username === 'set' ? '••• configured •••' : 'API username'}
                value={finaleUsername}
                onChange={e => setFinaleUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-1.5">API Password</label>
              <input
                type="password"
                className="input w-full"
                placeholder={settings._env_finale_password === 'set' ? '••• configured •••' : 'API password'}
                value={finalePassword}
                onChange={e => setFinalePassword(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-orange-900">
              Find these in Finale → Admin → API Keys. The account name is your Finale subdomain (e.g. <code className="text-orange-700">deltamunchies</code>).
            </p>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveFinale}
                disabled={saving || (!finaleAccount && !finaleUsername && !finalePassword)}
                className="btn-primary text-xs"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Credentials
              </button>
              <button onClick={testFinaleConnection} disabled={testingFinale} className="btn-ghost text-xs">
                {testingFinale ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Test Connection
              </button>
              {saved && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </div>
            {finaleResult && (
              <div className={cn('card p-3 mt-2', finaleResult.ok ? 'border-emerald-500/20' : 'border-red-500/20')}>
                <div className={cn('flex items-center gap-2 text-xs font-bold uppercase', finaleResult.ok ? 'text-emerald-400' : 'text-red-400')}>
                  {finaleResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {finaleResult.ok ? 'Connected' : 'Failed'}
                </div>
                <p className={cn('text-xs mt-1', finaleResult.ok ? 'text-orange-200/60' : 'text-red-300')}>{finaleResult.msg}</p>
              </div>
            )}
          </div>
        </Section>

        {/* Google Sheets */}
        <Section icon={<FileSpreadsheet className="w-4 h-4" />} title="Google Sheets" status={hasGoogleJson && hasSheetId ? 'connected' : 'setup required'}>

          {/* Service Account JSON */}
          <div>
            <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">
              <Key className="w-3 h-3 inline mr-1 -mt-0.5" />
              Service Account JSON
            </label>
            {hasGoogleJson && !googleJson ? (
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-400">Service account configured</span>
                <button onClick={() => setGoogleJson(' ')} className="text-[10px] text-orange-500 hover:text-orange-400 ml-2">Replace</button>
              </div>
            ) : (
              <textarea
                className="input w-full min-h-[120px] font-mono text-[11px] resize-none"
                placeholder='Paste the entire JSON file contents here. It starts with {"type":"service_account",...}'
                value={googleJson}
                onChange={e => setGoogleJson(e.target.value)}
              />
            )}
            <div className="text-[10px] text-orange-900 mt-1.5 space-y-1">
              <p>1. Go to <span className="text-orange-500">console.cloud.google.com</span> → Create project → Enable Google Sheets API</p>
              <p>2. Create a <span className="text-orange-500">Service Account</span> → Keys tab → Add Key → JSON → Download</p>
              <p>3. Paste the full JSON file contents above</p>
            </div>
          </div>

          {/* Sheet ID */}
          <div className="mt-4">
            <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">
              Google Sheet ID
            </label>
            <input
              className="input w-full"
              placeholder="Paste the spreadsheet ID from the URL..."
              value={sheetId}
              onChange={e => setSheetId(extractSheetId(e.target.value))}
            />
            <p className="text-[10px] text-orange-900 mt-1.5">
              Paste the full URL or just the ID. From: docs.google.com/spreadsheets/d/<span className="text-orange-500">THIS_PART</span>/edit
            </p>
          </div>

          {/* Sheet Tab */}
          <div className="mt-4">
            <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">
              Sheet Tab Name
            </label>
            <input
              className="input w-full max-w-xs"
              placeholder="Sheet1"
              value={sheetTab}
              onChange={e => setSheetTab(e.target.value)}
            />
          </div>

          {/* Share reminder */}
          {hasGoogleJson && (
            <div className="mt-4 card p-3 bg-[#12100d] border-orange-500/20">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wide mb-1">
                <ExternalLink className="w-3 h-3 inline mr-1 -mt-0.5" /> Don&apos;t forget
              </p>
              <p className="text-xs text-orange-300/50">
                Share your Google Sheet with the service account email (the <code className="text-orange-400">client_email</code> from the JSON). Give it <span className="text-orange-300">Viewer</span> access.
              </p>
            </div>
          )}

          {/* Test connection */}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={testSheets} disabled={testingSheets || (!hasGoogleJson && !googleJson)} className="btn-ghost text-xs">
              {testingSheets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Test Sheet Connection
            </button>
          </div>

          {sheetsResult && (
            <div className={cn('mt-3 card p-3', sheetsResult.ok ? 'border-emerald-500/20' : 'border-red-500/20')}>
              {sheetsResult.ok ? (
                <div className="text-xs">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </div>
                  <p className="text-orange-200/70">Sheet: {sheetsResult.sheetTitle} · {sheetsResult.rowCount} rows</p>
                  <p className="text-orange-200/50">Headers: {sheetsResult.headers?.join(', ')}</p>
                </div>
              ) : (
                <div className="text-xs">
                  <div className="flex items-center gap-2 text-red-400 font-bold uppercase mb-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Failed
                  </div>
                  <p className="text-red-300">{sheetsResult.error}</p>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Expected sheet format */}
        <Section icon={<FileSpreadsheet className="w-4 h-4" />} title="Expected Sheet Format">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-orange-500">
                  <th className="pr-8 py-1 text-left">Product ID</th>
                  <th className="pr-8 py-1 text-left">Bin Location</th>
                  <th className="pr-8 py-1 text-left">Physical Count</th>
                </tr>
              </thead>
              <tbody className="text-orange-200/50 font-mono">
                <tr><td className="pr-8 py-0.5">P5D-TP-10PK</td><td className="pr-8">SFS-B-04-01-L</td><td>120</td></tr>
                <tr><td className="pr-8 py-0.5">P5D-CC-10PK</td><td className="pr-8">SFS-B-04-01-C</td><td>85</td></tr>
                <tr><td className="pr-8 py-0.5">ECC-CF-01</td><td className="pr-8">SFS-B-07-01-R</td><td>200</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-orange-900 mt-2">
            Headers are auto-detected. Columns just need to include words like &quot;product/sku/item&quot;, &quot;bin/location&quot;, and &quot;count/qty/physical&quot;.
          </p>
        </Section>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn-primary text-xs">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0a07] border border-orange-900/30 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function Section({ icon, title, status, children }: {
  icon: React.ReactNode; title: string; status?: string; children: React.ReactNode
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-orange-500">{icon}</span>
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
        {status && (
          <span className={cn('badge text-[10px] ml-auto',
            status === 'connected' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
            'text-orange-400 bg-orange-500/10 border-orange-500/20'
          )}>
            {status}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function extractSheetId(input: string): string {
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}
