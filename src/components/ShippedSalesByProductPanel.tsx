'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { RefreshCw, Upload, ChevronDown, ChevronRight, AlertTriangle, Package } from 'lucide-react'

interface AggRow { product: string; product_id: string; qty: number; revenue: number }
interface MonthAggRow { month_key: string; product: string; product_id: string; qty: number; revenue: number }
interface Meta { last_import: string | null; total: number }

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ShippedSalesByProductPanel() {
  const [thisMonthAgg, setThisMonthAgg] = useState<AggRow[]>([])
  const [byMonthAgg, setByMonthAgg] = useState<MonthAggRow[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'thismonth' | 'bymonth'>('thismonth')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadThisMonth() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/shipped-sales-by-product')
      const data = await res.json()
      setThisMonthAgg(data.agg ?? [])
      setMeta(data.meta ?? null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  async function loadByMonth() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/shipped-sales-by-product?mode=bymonth')
      const data = await res.json()
      setByMonthAgg(data.agg ?? [])
      setMeta(data.meta ?? null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadThisMonth() }, [])
  useEffect(() => {
    if (activeTab === 'bymonth' && byMonthAgg.length === 0) loadByMonth()
    if (activeTab === 'thismonth' && thisMonthAgg.length === 0) loadThisMonth()
  }, [activeTab])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/shipped-sales-by-product', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setThisMonthAgg([]); setByMonthAgg([])
      await loadThisMonth()
    } catch (e) { setError(String(e)) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function toggle(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // This Month filtered
  const filteredThis = useMemo(() => {
    if (!search) return thisMonthAgg
    const q = search.toLowerCase()
    return thisMonthAgg.filter(r => r.product.toLowerCase().includes(q) || r.product_id.toLowerCase().includes(q))
  }, [thisMonthAgg, search])

  // By Month grouped
  const monthMap = useMemo(() => {
    const q = search.toLowerCase()
    const map = new Map<string, MonthAggRow[]>()
    for (const r of byMonthAgg) {
      if (search && !r.product.toLowerCase().includes(q) && !r.product_id.toLowerCase().includes(q)) continue
      const label = monthLabel(r.month_key)
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(r)
    }
    return map
  }, [byMonthAgg, search])

  const hasData = activeTab === 'thismonth' ? thisMonthAgg.length > 0 : byMonthAgg.length > 0

  const statQty     = activeTab === 'bymonth' ? byMonthAgg.reduce((s, r) => s + r.qty, 0)     : filteredThis.reduce((s, r) => s + r.qty, 0)
  const statRevenue = activeTab === 'bymonth' ? byMonthAgg.reduce((s, r) => s + r.revenue, 0) : filteredThis.reduce((s, r) => s + r.revenue, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('thismonth')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'thismonth' ? 'bg-orange-500/15 text-orange-400' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            This Month Sale
          </button>
          <button
            onClick={() => setActiveTab('bymonth')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'bymonth' ? 'bg-orange-500/15 text-orange-400' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            By Month
          </button>
          <p className="text-white/20 text-xs ml-3">
            {meta?.last_import ? `Updated ${new Date(meta.last_import).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No data uploaded'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product…"
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 w-48"
            />
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
          >
            <Upload className={`w-3.5 h-3.5 ${uploading ? 'animate-pulse' : ''}`} />
            {uploading ? 'Importing…' : 'Upload CSV / Excel'}
          </button>
          <button
            onClick={() => activeTab === 'bymonth' ? loadByMonth() : loadThisMonth()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Stats */}
      {hasData && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Units Shipped</div>
            <div className="text-white font-bold text-xl">{statQty.toLocaleString()}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Revenue</div>
            <div className="text-green-400 font-bold text-xl">{fmtMoney(statRevenue)}</div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-white/20">
            <Package className="w-12 h-12" />
            <div className="text-center">
              <p className="text-sm font-semibold text-white/40 mb-1">No product data yet</p>
              <p className="text-xs">Export "Andy Custom Report - Shipped Sales" from Finale and upload the Excel or CSV file</p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-white/60 hover:text-white hover:border-white/30 text-sm transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload Excel / CSV
            </button>
          </div>
        ) : activeTab === 'thismonth' ? (
          /* ── This Month by Product ── */
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0d0d0d] z-10">
                <tr>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Product</th>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">SKU</th>
                  <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Qty Shipped</th>
                  <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {filteredThis.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.04]">
                    <td className="px-4 py-2.5 text-white/80 max-w-xs">
                      <span className="truncate block">{r.product || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-orange-400/70 text-[11px]">{r.product_id || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-white/50">{r.qty.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-green-400">
                      {r.revenue > 0 ? fmtMoney(r.revenue) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : monthMap.size === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">No results match your search</div>
        ) : (
          /* ── By Month ── */
          Array.from(monthMap.entries()).map(([month, rows]) => {
            const monthRevenue = rows.reduce((s, r) => s + r.revenue, 0)
            const monthQty     = rows.reduce((s, r) => s + r.qty, 0)
            const isOpen = expanded.has(month)
            return (
              <div key={month} className="border border-white/10 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(month)}
                  className="w-full flex items-center px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left"
                >
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                    : <ChevronRight className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                  }
                  <span className="text-white font-semibold text-sm flex-1">{month}</span>
                  <div className="flex items-center gap-8 text-xs">
                    <span className="text-white/40">{monthQty.toLocaleString()} units</span>
                    <span className="text-green-400 font-bold font-mono w-24 text-right">{fmtMoney(monthRevenue)}</span>
                  </div>
                </button>
                {isOpen && (
                  <table className="w-full text-xs border-collapse border-t border-white/10">
                    <thead>
                      <tr className="bg-black/30">
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Product</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">SKU</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Qty</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                          <td className="px-4 py-2 text-white/70 max-w-xs">
                            <span className="truncate block">{r.product || '—'}</span>
                          </td>
                          <td className="px-4 py-2 font-mono text-orange-400/60 text-[11px]">{r.product_id || '—'}</td>
                          <td className="px-4 py-2 text-right text-white/40">{r.qty.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-green-400">
                            {r.revenue > 0 ? fmtMoney(r.revenue) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
