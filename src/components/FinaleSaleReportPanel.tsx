'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, FileSpreadsheet, Search, Upload, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SaleRow {
  product_id: string
  product_name: string | null
  category: string | null
  sales_7d: number | null
  sales_30d: number | null
  sales_60d: number | null
  sales_90d: number | null
  sales_180d: number | null
  sales_last_month: number | null
  sales_this_month: number | null
  qty_on_hand: number | null
  qty_available: number | null
  average_cost: number | null
  upc: string | null
}

interface ReportData {
  rows: SaleRow[]
  total: number
  page: number
  limit: number
  importedAt: string | null
}

const PAGE_SIZE = 200

function fmt(v: number | null, decimals = 0): string {
  if (v == null) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function FinaleSaleReportPanel() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (p = page, s = debouncedSearch) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
      if (s) params.set('search', s)
      const res = await fetch(`/api/finale/sales-report?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (err) {
      console.error('load error', err)
    }
    setLoading(false)
  }, [page, debouncedSearch])

  useEffect(() => { load(page, debouncedSearch) }, [page, debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); setDebouncedSearch(search) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const uploadCsv = async (file: File) => {
    setUploading(true)
    setUploadError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/finale/import-sales-csv', { method: 'POST', body: form })
      const result = await res.json()
      if (result.error) { setUploadError(result.error) } else { setPage(1); await load(1, debouncedSearch) }
    } catch (err) {
      setUploadError((err as Error).message)
    }
    setUploading(false)
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-bold text-white uppercase tracking-wide">Finale Sale Report</span>
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
              placeholder="Search product ID, name, category..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={() => load(page, debouncedSearch)} disabled={loading} className="btn-ghost text-xs h-8 px-3">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
          <label className="btn-primary text-xs h-8 px-3 cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Importing...' : 'Upload CSV'}
            <input type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCsv(f) }} />
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="mx-6 mt-3 card p-3 border-red-500/20 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{uploadError}</p>
        </div>
      )}

      {/* Summary */}
      {data && data.total > 0 && (
        <div className="px-6 py-3 border-b border-orange-900/20 bg-black flex gap-6 shrink-0">
          <div>
            <div className="text-lg font-black text-orange-400 tabular-nums">{data.total.toLocaleString()}</div>
            <div className="text-[10px] text-orange-700 uppercase tracking-wide">Products</div>
          </div>
          {debouncedSearch && (
            <div>
              <div className="text-lg font-black text-amber-400 tabular-nums">{data.rows.length.toLocaleString()}</div>
              <div className="text-[10px] text-orange-700 uppercase tracking-wide">Results</div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data || data.total === 0) && (
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <FileSpreadsheet className="w-12 h-12 text-orange-900" />
          <div className="text-center">
            <p className="text-sm font-bold text-orange-400">No sales data yet</p>
            <p className="text-xs text-orange-700 mt-1">
              In Finale, go to Inventory → Stock: Sales View → Export CSV, then upload it here.
            </p>
          </div>
          <label className="btn-primary text-xs cursor-pointer flex items-center gap-2">
            <Upload className="w-3.5 h-3.5" /> Upload CSV
            <input type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCsv(f) }} />
          </label>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
          <span className="text-sm text-orange-400">Loading...</span>
        </div>
      )}

      {/* Table */}
      {!loading && data && data.rows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-black z-10 border-b border-orange-900/30">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Product ID</th>
                <th className="text-left px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Description</th>
                <th className="text-left px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Category</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Sales 7d</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Sales 30d</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Sales 60d</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Sales 90d</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Sales 180d</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Last Month</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">This Month</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Qty On Hand</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Qty Available</th>
                <th className="text-right px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">Avg Cost</th>
                <th className="text-left px-4 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-600">UPC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-900/10">
              {data.rows.map((r, i) => (
                <tr key={i} className="hover:bg-orange-500/5 transition-colors">
                  <td className="px-4 py-2 font-mono text-orange-300 font-medium whitespace-nowrap">{r.product_id}</td>
                  <td className="px-4 py-2 text-orange-200/70 max-w-[200px] truncate">{r.product_name || '—'}</td>
                  <td className="px-4 py-2 text-orange-400/70">{r.category || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-white">{fmt(r.sales_7d)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-white">{fmt(r.sales_30d)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-white">{fmt(r.sales_60d)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-white">{fmt(r.sales_90d)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-white">{fmt(r.sales_180d)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-400">{fmt(r.sales_last_month)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-400">{fmt(r.sales_this_month)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-sky-400 font-bold">{fmt(r.qty_on_hand)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-sky-300">{fmt(r.qty_available)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-orange-300">{r.average_cost != null ? `$${fmt(r.average_cost, 4)}` : '—'}</td>
                  <td className="px-4 py-2 font-mono text-orange-800 text-[10px]">{r.upc || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-orange-900/30 bg-black">
          <span className="text-xs text-orange-700">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total.toLocaleString()} rows
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost h-7 w-7 p-0 justify-center">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-orange-400">Page {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-ghost h-7 w-7 p-0 justify-center">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
