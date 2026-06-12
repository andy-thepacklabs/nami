'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, FileSpreadsheet, Search, Upload, AlertCircle, Zap, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StockRow {
  product_id: string
  product_name: string
  category: string
  bin_location: string
  qoh: number
  available: number | null
  consumed_90d: number | null
  sales_7d: number | null
  sales_30d: number | null
  sales_60d: number | null
  sales_90d: number | null
  sales_this_month: number | null
  sales_last_month: number | null
}

interface ReportData {
  rows: StockRow[]
  importedAt: string | null
  totalProducts: number
  totalBins: number
  totalUnits: number
  page: number
  limit: number
  filteredTotal: number
}

const PAGE_SIZE = 200

export default function FinaleReportPanel({ onClose: _ }: { onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [uploadingStock, setUploadingStock] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok?: boolean; source?: string; imported?: number; products?: number; skipped?: number; note?: string; error?: string; bins?: number; salesSynced?: number } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (p = page, s = debouncedSearch) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
      if (s) params.set('search', s)
      const res = await fetch(`/api/finale/stock-report?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (err) {
      console.error('load error', err)
    }
    setLoading(false)
  }, [page, debouncedSearch])

  useEffect(() => { load(page, debouncedSearch) }, [page, debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search — push to server after 350ms
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setDebouncedSearch(search)
    }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const syncFromApi = async () => {
    setSyncing(true)
    setSyncResult(null)
    setUploadError('')
    try {
      const res = await fetch('/api/finale/sync', { method: 'POST' })
      const result = await res.json()
      setSyncResult(result)
      if (!result.error) { setPage(1); await load(1, debouncedSearch); window.dispatchEvent(new Event('finale-synced')) }
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
      if (result.error) { setUploadError(result.error) } else { setPage(1); await load(1, debouncedSearch); window.dispatchEvent(new Event('finale-synced')) }
    } catch (err) {
      setUploadError((err as Error).message)
    }
    setUploadingStock(false)
  }

  const totalPages = data ? Math.ceil(data.filteredTotal / PAGE_SIZE) : 1

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-orange-900/30 bg-[#0d0a07] shrink-0">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-bold text-white uppercase tracking-wide">Finale Report</span>
          {data?.importedAt && (
            <span className="text-[10px] text-white/40">
              Last import: {new Date(data.importedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-orange-700 absolute left-2.5 top-2" />
            <input
              className="input text-xs h-8 pl-8 w-52"
              placeholder="Search product, category or bin..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={() => load(page, debouncedSearch)} disabled={loading} className="btn-ghost text-xs h-8 px-3">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
          <button onClick={syncFromApi} disabled={syncing} className="btn-primary text-xs h-8 px-3 flex items-center gap-1.5">
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {syncing ? 'Syncing...' : 'Sync from Finale'}
          </button>
          <label className="btn-ghost text-xs h-8 px-3 cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            {uploadingStock ? 'Importing...' : 'CSV'}
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
                {syncResult.source === 'graphql' ? (
                  <>
                    Auto-synced <span className="font-bold">{syncResult.products}</span> products
                    {syncResult.imported !== syncResult.products && (
                      <> · <span className="font-bold">{syncResult.imported}</span> bin rows</>
                    )}
                    {(syncResult.salesSynced ?? 0) > 0 && <> · <span className="font-bold text-sky-400">{syncResult.salesSynced} sales records</span></>}
                    {(syncResult.skipped ?? 0) > 0 && <span className="text-orange-400 ml-2">({syncResult.skipped} inactive skipped)</span>}
                  </>
                ) : (
                  <>Synced <span className="font-bold">{syncResult.products}</span> active products from Finale API
                    {(syncResult.skipped ?? 0) > 0 && <span className="text-orange-400 ml-2">({syncResult.skipped} inactive skipped)</span>}
                  </>
                )}
                {syncResult.note && <span className="text-orange-400 ml-2">· {syncResult.note}</span>}
              </div>
            </div>
          )}
        </div>
      )}
      {uploadError && (
        <div className="mx-6 mt-3 card p-3 border-red-500/20 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{uploadError}</p>
        </div>
      )}

      {/* Summary cards */}
      {data && data.totalProducts > 0 && (
        <div className="px-6 py-3 border-b border-orange-900/20 bg-[#12100d] flex gap-6 shrink-0">
          <div>
            <div className="text-lg font-black text-orange-400 tabular-nums">{data.totalProducts.toLocaleString()}</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wide">Products</div>
          </div>
          <div>
            <div className="text-lg font-black text-white tabular-nums">{data.totalBins.toLocaleString()}</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wide">Bin Locations</div>
          </div>
          <div>
            <div className="text-lg font-black text-emerald-400 tabular-nums">{Math.round(data.totalUnits).toLocaleString()}</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wide">Total Units</div>
          </div>
          {debouncedSearch && (
            <div>
              <div className="text-lg font-black text-amber-400 tabular-nums">{data.filteredTotal.toLocaleString()}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wide">Results</div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data || data.totalProducts === 0) && (
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <FileSpreadsheet className="w-12 h-12 text-orange-900" />
          <div className="text-center">
            <p className="text-sm font-bold text-orange-400">No Finale stock data yet</p>
            <p className="text-xs text-orange-700 mt-1">Sync from Finale API or upload a CSV export</p>
          </div>
          <button onClick={syncFromApi} disabled={syncing} className="btn-primary text-xs flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" />Sync from Finale
          </button>
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
      {!loading && data && data.rows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0d0a07] z-10">
              <tr className="border-b border-white/10">
                <th className="text-left text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Product ID</th>
                <th className="text-left text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Description</th>
                <th className="text-left text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Category</th>
                <th className="text-left text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Bin Location</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Stock QoH</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Available</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Consumed 90d</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Sale 7d</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Sale 30d</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Sale 60d</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Sale 90d</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">This Month</th>
                <th className="text-right text-xs font-extrabold text-white/50 px-3 py-2.5 uppercase tracking-[0.1em] whitespace-nowrap">Last Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-2 font-mono text-orange-300 font-semibold whitespace-nowrap">{r.product_id}</td>
                  <td className="px-3 py-2 text-white/60 max-w-[240px] truncate" title={r.product_name || ''}>{r.product_name || '—'}</td>
                  <td className="px-3 py-2 text-white/50 whitespace-nowrap">{r.category || '—'}</td>
                  <td className="px-3 py-2 font-mono text-white/60 whitespace-nowrap">{r.bin_location || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-white tabular-nums whitespace-nowrap">{r.qoh > 0 ? r.qoh.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400 tabular-nums whitespace-nowrap">{r.available != null && r.available > 0 ? r.available.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-amber-400 tabular-nums whitespace-nowrap">
                    {r.consumed_90d != null && r.consumed_90d > 0 ? Math.round(r.consumed_90d).toLocaleString() : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sky-400 tabular-nums whitespace-nowrap">{r.sales_7d != null && r.sales_7d > 0 ? r.sales_7d.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-sky-400 tabular-nums whitespace-nowrap">{r.sales_30d != null && r.sales_30d > 0 ? r.sales_30d.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-sky-400 tabular-nums whitespace-nowrap">{r.sales_60d != null && r.sales_60d > 0 ? r.sales_60d.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-sky-400 tabular-nums whitespace-nowrap">{r.sales_90d != null && r.sales_90d > 0 ? r.sales_90d.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400 tabular-nums whitespace-nowrap">{r.sales_this_month != null && r.sales_this_month > 0 ? r.sales_this_month.toLocaleString() : <span className="text-white/30">0</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-300 tabular-nums whitespace-nowrap">{r.sales_last_month != null && r.sales_last_month > 0 ? r.sales_last_month.toLocaleString() : <span className="text-white/30">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-orange-900/30 bg-[#0d0a07]">
          <span className="text-xs text-white/40">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, data.filteredTotal)} of {data.filteredTotal.toLocaleString()} rows
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost h-7 w-7 p-0 justify-center">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-white/50">Page {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-ghost h-7 w-7 p-0 justify-center">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
