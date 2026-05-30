'use client'

import { useState, useEffect } from 'react'
import {
  X, RefreshCw, CheckCircle2, AlertCircle, Database,
  Package, MapPin, Truck, Archive, Search, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SyncStats {
  products: number
  facilities: number
  shipments: number
  orders: number
  lastSync?: {
    completed_at: string
    errors: string | null
    products: number
    facilities: number
    shipments: number
    orders_synced: number
    discrepancies: number
  }
}

interface DetectionRule {
  rule: string
  created: number
  skipped: number
}

interface SyncResult {
  products: number
  facilities: number
  shipments: number
  orders: number
  transfers: number
  stockLevels: number
  detection: { rules: DetectionRule[]; totalCreated: number; totalSkipped: number } | null
  errors: string[]
  timestamp: string
}

type TabKey = 'overview' | 'products' | 'bins'

export default function FinalePanel({ onClose, onSync }: { onClose: () => void; onSync?: () => void }) {
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const [testing, setTesting] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')

  const loadStats = async () => {
    const res = await fetch('/api/finale/sync')
    setStats(await res.json())
  }

  const testConnection = async () => {
    setTesting(true)
    setConnectionOk(null)
    try {
      const res = await fetch('/api/finale/test')
      const data = await res.json()
      setConnectionOk(data.ok)
      if (!data.ok) setConnectionError(data.error || 'Unknown error')
    } catch (err) {
      setConnectionOk(false)
      setConnectionError((err as Error).message)
    }
    setTesting(false)
  }

  const runSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/finale/sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setSyncResult({ products: 0, facilities: 0, shipments: 0, orders: 0, transfers: 0, stockLevels: 0, detection: null, errors: [data.error], timestamp: new Date().toISOString() })
      } else {
        setSyncResult(data)
      }
      loadStats()
      onSync?.()
    } catch (err) {
      setSyncResult({ products: 0, facilities: 0, shipments: 0, orders: 0, transfers: 0, stockLevels: 0, detection: null, errors: [(err as Error).message], timestamp: new Date().toISOString() })
    }
    setSyncing(false)
  }

  useEffect(() => { loadStats() }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111111] border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-lime-500" />
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Finale Inventory</h2>
            {connectionOk === true && <span className="badge text-[10px] text-lime-400 bg-lime-500/10 border-lime-500/20">Connected</span>}
            {connectionOk === false && <span className="badge text-[10px] text-red-400 bg-red-500/10 border-red-500/20">Error</span>}
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 px-6 py-3 bg-neutral-900/50 border-b border-neutral-800">
          <button onClick={testConnection} disabled={testing} className="btn-ghost text-xs">
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Test Connection
          </button>
          <button onClick={runSync} disabled={syncing} className="btn-primary text-xs">
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? 'Syncing...' : 'Full Sync'}
          </button>
          {stats?.lastSync?.completed_at && (
            <span className="text-xs text-neutral-500 ml-auto">
              Last sync: {new Date(stats.lastSync.completed_at).toLocaleString()}
            </span>
          )}
        </div>

        {/* Connection error */}
        {connectionOk === false && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide mb-1">
              <AlertCircle className="w-4 h-4" /> Connection Failed
            </div>
            <p className="text-xs text-red-300">{connectionError}</p>
            <p className="text-xs text-neutral-500 mt-2">
              Check your .env.local file has the correct FINALE_ACCOUNT, FINALE_USERNAME, and FINALE_PASSWORD values.
            </p>
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div className={cn(
            'mx-6 mt-4 px-4 py-3 rounded-lg border text-sm',
            syncResult.errors.length
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              : 'bg-lime-500/10 border-lime-500/20 text-lime-300'
          )}>
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide mb-2">
              {syncResult.errors.length ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              Sync {syncResult.errors.length ? 'Completed with Errors' : 'Complete'}
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div><span className="text-neutral-500">Products:</span> <span className="font-bold text-white">{syncResult.products}</span></div>
              <div><span className="text-neutral-500">Facilities:</span> <span className="font-bold text-white">{syncResult.facilities}</span></div>
              <div><span className="text-neutral-500">Transfers:</span> <span className="font-bold text-white">{syncResult.transfers}</span></div>
              <div><span className="text-neutral-500">Stock Levels:</span> <span className="font-bold text-white">{syncResult.stockLevels}</span></div>
              <div><span className="text-neutral-500">Shipments:</span> <span className="font-bold text-white">{syncResult.shipments}</span></div>
              <div><span className="text-neutral-500">Orders:</span> <span className="font-bold text-white">{syncResult.orders}</span></div>
            </div>
            {syncResult.detection && syncResult.detection.totalCreated > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wide mb-2">
                  <AlertCircle className="w-3.5 h-3.5" /> {syncResult.detection.totalCreated} Issues Auto-Detected
                </div>
                <div className="flex flex-col gap-1">
                  {syncResult.detection.rules.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">{r.rule}</span>
                      <span className="text-white font-mono">
                        {r.created > 0 && <span className="text-red-400">{r.created} new</span>}
                        {r.created > 0 && r.skipped > 0 && <span className="text-neutral-600"> · </span>}
                        {r.skipped > 0 && <span className="text-neutral-500">{r.skipped} existing</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {syncResult.errors.length > 0 && (
              <div className="mt-2 text-xs text-amber-400">
                {syncResult.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 px-6 mt-2">
          {([
            { key: 'overview', label: 'Overview', icon: <Database className="w-3.5 h-3.5" /> },
            { key: 'products', label: 'Products', icon: <Package className="w-3.5 h-3.5" /> },
            { key: 'bins',     label: 'Bins / Locations', icon: <MapPin className="w-3.5 h-3.5" /> },
          ] as { key: TabKey; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors uppercase tracking-wide',
                tab === key
                  ? 'border-lime-500 text-lime-400'
                  : 'border-transparent text-neutral-500 hover:text-white'
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && <OverviewTab stats={stats} />}
          {tab === 'products' && <DataTable endpoint="/api/finale/products" columns={['product_id', 'internal_name', 'status', 'product_type', 'container_id', 'category']} />}
          {tab === 'bins' && <DataTable endpoint="/api/finale/facilities" columns={['facility_id', 'facility_name', 'facility_type', 'status', 'parent_url']} />}
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ stats }: { stats: SyncStats | null }) {
  if (!stats) return <p className="text-neutral-500 text-sm">Loading...</p>

  const cards = [
    { label: 'Products', value: stats.products, icon: <Package className="w-5 h-5" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Locations / Bins', value: stats.facilities, icon: <MapPin className="w-5 h-5" />, color: 'text-lime-400', bg: 'bg-lime-500/10' },
    { label: 'Shipments', value: stats.shipments, icon: <Truck className="w-5 h-5" />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Orders', value: stats.orders, icon: <Archive className="w-5 h-5" />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bg, color)}>{icon}</div>
            <div>
              <div className="text-xl font-black text-white tabular-nums">{value}</div>
              <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.15em]">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {stats.lastSync ? (
        <div className="card p-4">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-3">Last Sync Details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Completed" value={new Date(stats.lastSync.completed_at).toLocaleString()} />
            <Row label="Products synced" value={String(stats.lastSync.products)} />
            <Row label="Facilities synced" value={String(stats.lastSync.facilities)} />
            <Row label="Shipments synced" value={String(stats.lastSync.shipments)} />
            <Row label="Orders synced" value={String(stats.lastSync.orders_synced)} />
            <Row label="Discrepancies found" value={String(stats.lastSync.discrepancies)} />
            {stats.lastSync.errors && <Row label="Errors" value={stats.lastSync.errors} error />}
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <Database className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-sm text-neutral-400 mb-1">No data synced yet</p>
          <p className="text-xs text-neutral-600">Click "Full Sync" above to pull your inventory from Finale.</p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={cn('text-xs font-mono', error ? 'text-red-400' : 'text-white')}>{value}</span>
    </div>
  )
}

function DataTable({ endpoint, columns }: { endpoint: string; columns: string[] }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = async (q?: string) => {
    setLoading(true)
    const url = q ? `${endpoint}?q=${encodeURIComponent(q)}` : endpoint
    const res = await fetch(url)
    const data = await res.json()
    setRows(data.rows || [])
    setTotal(data.total || 0)
    setError(data.error || '')
    setLoading(false)
  }

  useEffect(() => { load() }, [endpoint])
  useEffect(() => {
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  if (error && rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Database className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
        <p className="text-sm text-neutral-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
        <input
          className="input w-full pl-9"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="text-xs text-neutral-500 font-medium">{total} record{total !== 1 ? 's' : ''}</div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/50">
                {columns.map(col => (
                  <th key={col} className="text-left text-[10px] font-bold text-neutral-500 px-4 py-3 uppercase tracking-[0.15em] whitespace-nowrap">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {loading ? (
                <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-neutral-500 text-xs">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-neutral-500 text-xs">No data found</td></tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="hover:bg-neutral-800/50 transition-colors">
                    {columns.map(col => (
                      <td key={col} className="px-4 py-2.5 text-xs text-neutral-300 font-mono whitespace-nowrap">
                        {String(row[col] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
