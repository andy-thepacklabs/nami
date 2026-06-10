'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, FileSpreadsheet, Search, Upload, AlertCircle, Zap, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StockRow {
  product_id: string
  product_name: string
  bin_location: string
  qoh: number
}

interface ReportData {
  rows: StockRow[]
  importedAt: string | null
  totalProducts: number
  totalUnits: number
}

export default function FinaleReportPanel({ onClose: _ }: { onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [uploadingStock, setUploadingStock] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok?: boolean; source?: string; imported?: number; products?: number; note?: string; error?: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finale/stock-report')
      setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const syncFromApi = async () => {
    setSyncing(true)
    setSyncResult(null)
    setUploadError('')
    try {
      const res = await fetch('/api/finale/sync', { method: 'POST' })
      const result = await res.json()
      setSyncResult(result)
      if (!result.error) await load()
    } catch (err) {
      setSyncResult({ error: (err as Error).message })
    }
    setSyncing(false)
  }

  const uploadCsv = async (file: File) => {
    setUploadingStock(true)
    setUploadError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/finale/import-stock-csv', { method: 'POST', body: form })
      const result = await res.json()
      if (result.error) { setUploadError(result.error) } else { await load() }
    } catch (err) {
      setUploadError((err as Error).message)
    }
    setUploadingStock(false)
  }

  const filtered = data?.rows.filter(r =>
    !search || r.product_id.toLowerCase().includes(search.toLowerCase()) ||
    r.product_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.bin_location?.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-orange-900/30 bg-[#0d0a07] shrink-0">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-bold text-white uppercase tracking-wide">Finale Report</span>
          {data?.importedAt && (
            <span className="text-[10px] text-orange-700">
              Last import: {new Date(data.importedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-orange-700 absolute left-2.5 top-2" />
            <input
              className="input text-xs h-8 pl-8 w-52"
              placeholder="Search product or bin..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={load} disabled={loading} className="btn-ghost text-xs h-8 px-3">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
          {/* Sync from Finale API */}
          <button
            onClick={syncFromApi}
            disabled={syncing}
            className="btn-primary text-xs h-8 px-3 flex items-center gap-1.5"
          >
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {syncing ? 'Syncing...' : 'Sync from Finale'}
          </button>
          {/* Upload CSV fallback */}
          <label className="btn-ghost text-xs h-8 px-3 cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            CSV
            <input type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCsv(f) }} />
          </label>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={cn('mx-6 mt-3 card p-3 shrink-0', syncResult.error ? 'border-red-500/20' : 'border-emerald-500/20')}>
          {syncResult.error ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{syncResult.error}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-xs text-emerald-300">
                Synced <span className="font-bold">{syncResult.products}</span> products
                {syncResult.imported !== syncResult.products && <>, <span className="font-bold">{syncResult.imported}</span> bin rows</>}
                {' '}from Finale API
                {syncResult.note && <span className="text-orange-500 ml-2">({syncResult.note})</span>}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Upload error */}
      {uploadError && (
        <div className="mx-6 mt-3 card p-3 border-red-500/20 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{uploadError}</p>
        </div>
      )}

      {/* Summary cards */}
      {data && data.rows.length > 0 && (
        <div className="px-6 py-3 border-b border-orange-900/20 bg-[#12100d] flex gap-6 shrink-0">
          <div>
            <div className="text-lg font-black text-orange-400 tabular-nums">{data.totalProducts}</div>
            <div className="text-[10px] text-orange-700 uppercase tracking-wide">Products</div>
          </div>
          <div>
            <div className="text-lg font-black text-white tabular-nums">{data.rows.length}</div>
            <div className="text-[10px] text-orange-700 uppercase tracking-wide">Bin Locations</div>
          </div>
          <div>
            <div className="text-lg font-black text-emerald-400 tabular-nums">{Math.round(data.totalUnits).toLocaleString()}</div>
            <div className="text-[10px] text-orange-700 uppercase tracking-wide">Total Units</div>
          </div>
          {search && (
            <div>
              <div className="text-lg font-black text-amber-400 tabular-nums">{filtered.length}</div>
              <div className="text-[10px] text-orange-700 uppercase tracking-wide">Results</div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data || data.rows.length === 0) && (
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <FileSpreadsheet className="w-12 h-12 text-orange-900" />
          <div className="text-center">
            <p className="text-sm font-bold text-orange-400">No Finale stock data yet</p>
            <p className="text-xs text-orange-700 mt-1">Export your stock report from Finale and upload it here</p>
            <p className="text-[10px] text-orange-900 mt-0.5">Finale → Products → Export (CSV)</p>
          </div>
          <label className="btn-primary text-xs cursor-pointer flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" />
            Upload Finale CSV
            <input type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCsv(f) }} />
          </label>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
          <span className="text-sm text-orange-400">Loading...</span>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0d0a07] z-10">
              <tr className="border-b border-orange-900/30">
                <th className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Product ID</th>
                <th className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Description</th>
                <th className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Bin Location</th>
                <th className="text-right text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">QoH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-900/10">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-orange-500/5 transition-colors">
                  <td className="px-4 py-2 font-mono text-orange-300 font-medium">{r.product_id}</td>
                  <td className="px-4 py-2 text-orange-200/60 max-w-xs truncate">{r.product_name || '—'}</td>
                  <td className="px-4 py-2 font-mono text-orange-400">{r.bin_location || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-white tabular-nums">{r.qoh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
