'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { RefreshCw, Upload, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusRow { status: string; orders: number; subtotal: number; total: number }
interface SourceRow { source: string; qty: number; revenue: number }
interface ProductRow { product: string; product_id: string; qty: number; revenue: number }
interface CategoryRow { category: string; qty: number; revenue: number }
interface OrderRow { order_id: string; order_date: string; status: string; customer: string; origin: string; subtotal: number; total: number }
interface ByMonthRow { month_key: string; source: string; qty: number; revenue: number }
interface Meta { last_import: string | null; last_sync: string | null; summary_count: number; detail_count: number }

export default function CommitSalePanel() {
  const [activeTab, setActiveTab] = useState<'today' | 'thismonth' | 'bymonth'>('today')

  const [todayStatus, setTodayStatus] = useState<StatusRow[]>([])
  const [todaySource, setTodaySource] = useState<SourceRow[]>([])
  const [todayProduct, setTodayProduct] = useState<ProductRow[]>([])
  const [todayCategory, setTodayCategory] = useState<CategoryRow[]>([])
  const [todayRows, setTodayRows] = useState<OrderRow[]>([])
  const [todayTotals, setTodayTotals] = useState({ orders: 0, subtotal: 0, total: 0, revenue: 0 })
  const [todayLoaded, setTodayLoaded] = useState(false)

  const [monthStatus, setMonthStatus] = useState<StatusRow[]>([])
  const [monthSource, setMonthSource] = useState<SourceRow[]>([])
  const [monthProduct, setMonthProduct] = useState<ProductRow[]>([])
  const [monthCategory, setMonthCategory] = useState<CategoryRow[]>([])
  const [monthRows, setMonthRows] = useState<OrderRow[]>([])
  const [monthTotals, setMonthTotals] = useState({ orders: 0, subtotal: 0, total: 0, revenue: 0 })
  const [monthLoaded, setMonthLoaded] = useState(false)

  const [byMonthData, setByMonthData] = useState<ByMonthRow[]>([])
  const [byMonthLoaded, setByMonthLoaded] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const applyData = (data: Record<string, unknown>, target: 'today' | 'thismonth') => {
    const setStatus = target === 'today' ? setTodayStatus : setMonthStatus
    const setSource = target === 'today' ? setTodaySource : setMonthSource
    const setProduct = target === 'today' ? setTodayProduct : setMonthProduct
    const setCategory = target === 'today' ? setTodayCategory : setMonthCategory
    const setRows = target === 'today' ? setTodayRows : setMonthRows
    const setTotals = target === 'today' ? setTodayTotals : setMonthTotals
    setStatus((data.byStatus ?? []) as StatusRow[])
    setSource((data.bySource ?? []) as SourceRow[])
    setProduct((data.byProduct ?? []) as ProductRow[])
    setCategory((data.byCategory ?? []) as CategoryRow[])
    setRows((data.rows ?? []) as OrderRow[])
    setTotals((data.totals ?? { orders: 0, subtotal: 0, total: 0, revenue: 0 }) as typeof todayTotals)
    setMeta((data.meta ?? null) as Meta | null)
  }

  const loadToday = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/commit-sales?mode=today').then(r => r.json())
      applyData(data, 'today')
      setTodayLoaded(true)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }, [])

  const loadThisMonth = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/commit-sales').then(r => r.json())
      applyData(data, 'thismonth')
      setMonthLoaded(true)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }, [])

  const loadByMonth = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/commit-sales?mode=bymonth').then(r => r.json())
      setByMonthData((data.byMonth ?? []) as ByMonthRow[])
      setMeta((data.meta ?? null) as Meta | null)
      setByMonthLoaded(true)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'today' && !todayLoaded) loadToday()
    else if (activeTab === 'thismonth' && !monthLoaded) loadThisMonth()
    else if (activeTab === 'bymonth' && !byMonthLoaded) loadByMonth()
  }, [activeTab, todayLoaded, monthLoaded, byMonthLoaded, loadToday, loadThisMonth, loadByMonth])

  const handleUpload = async (file: File) => {
    setUploading(true); setError(null); setUploadMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const data = await fetch('/api/commit-sales', { method: 'POST', body: fd }).then(r => r.json())
      if (data.ok) { setUploadMsg(`Imported ${data.inserted} orders`); resetLoaded() }
      else setError(data.error || 'Upload failed')
    } catch (e) { setError(String(e)) }
    setUploading(false)
  }

  const handleSync = async (historical = false) => {
    setSyncing(true); setSyncMsg(historical ? 'Starting historical sync…' : 'Syncing this month…'); setError(null)
    try {
      await fetch('/api/commit-sales-sync', { method: 'POST', body: JSON.stringify({ historical }) })
      const poll = async () => {
        const p = await fetch('/api/commit-sales-sync').then(r => r.json())
        if (p.status === 'done') {
          setSyncMsg(`Synced ${p.count.toLocaleString()} line items`); setSyncing(false); resetLoaded()
        } else if (p.status === 'error') {
          setError(p.error ?? 'Sync failed'); setSyncing(false)
        } else {
          setSyncMsg(p.progress || 'Syncing…'); setTimeout(poll, 2000)
        }
      }
      setTimeout(poll, 2000)
    } catch (e) { setError(String(e)); setSyncing(false) }
  }

  const resetLoaded = () => { setTodayLoaded(false); setMonthLoaded(false); setByMonthLoaded(false) }

  const statuses = activeTab === 'today' ? todayStatus : monthStatus
  const sources = activeTab === 'today' ? todaySource : monthSource
  const products = activeTab === 'today' ? todayProduct : monthProduct
  const categories = activeTab === 'today' ? todayCategory : monthCategory
  const rows = activeTab === 'today' ? todayRows : monthRows
  const totals = activeTab === 'today' ? todayTotals : monthTotals

  const monthGroups = useMemo(() => {
    const map = new Map<string, ByMonthRow[]>()
    for (const r of byMonthData) {
      const arr = map.get(r.month_key) ?? []; arr.push(r); map.set(r.month_key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [byMonthData])

  const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split('-')
    return new Date(+y, +m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  }

  const updated = meta?.last_sync || meta?.last_import
  const hasDetailData = (meta?.detail_count ?? 0) > 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />

      <div className="flex items-center gap-3 px-6 py-3 border-b border-orange-900/30 bg-[#0d0a07] shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          {(['today', 'thismonth', 'bymonth'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                activeTab === tab ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/40 hover:text-white hover:bg-white/5'
              )}>
              {tab === 'today' ? 'Today' : tab === 'thismonth' ? 'This Month Sale' : 'By Month'}
            </button>
          ))}
        </div>

        {updated && (
          <span className="text-xs text-white/30 ml-2">
            Updated {new Date(updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => handleSync(false)} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            Sync from Finale
          </button>
          <button onClick={() => handleSync(true)} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/50 border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50">
            Sync Jan-Jun 2026
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/50 border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50">
            <Upload className={cn('w-4 h-4', uploading && 'animate-pulse')} />
            Upload CSV
          </button>
          <button onClick={resetLoaded} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {syncMsg && <div className="px-6 py-2 bg-orange-500/10 text-orange-400 text-sm">{syncMsg}</div>}
      {uploadMsg && <div className="px-6 py-2 bg-green-500/10 text-green-400 text-sm">{uploadMsg}</div>}
      {error && <div className="px-6 py-2 bg-red-500/10 text-red-400 text-sm">{error}</div>}

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading && !statuses.length && !sources.length && !categories.length && !byMonthData.length ? (
          <div className="text-center text-white/30 py-12">Loading…</div>
        ) : activeTab === 'bymonth' ? (
          monthGroups.length === 0 ? (
            <div className="text-center text-white/30 py-12">No commit sale data. Sync from Finale first.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Units</div>
                  <div className="text-white font-bold text-xl">{byMonthData.reduce((s, r) => s + r.qty, 0).toLocaleString()}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Revenue</div>
                  <div className="text-orange-400 font-bold text-xl">{fmt(byMonthData.reduce((s, r) => s + r.revenue, 0))}</div>
                </div>
              </div>
              <div className="space-y-2">
                {monthGroups.map(([monthKey, mRows]) => {
                  const totalRev = mRows.reduce((s, r) => s + r.revenue, 0)
                  const totalQty = mRows.reduce((s, r) => s + r.qty, 0)
                  const isOpen = expanded.has(monthKey)
                  return (
                    <div key={monthKey} className="border border-white/10 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(monthKey) ? n.delete(monthKey) : n.add(monthKey); return n })}
                        className="w-full flex items-center px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left"
                      >
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                          : <ChevronRight className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                        }
                        <span className="text-white font-semibold text-sm flex-1">{fmtMonth(monthKey)}</span>
                        <div className="flex items-center gap-8 text-xs">
                          <span className="text-white/40">{totalQty.toLocaleString()} units</span>
                          <span className="text-orange-400 font-bold font-mono w-28 text-right">{fmt(totalRev)}</span>
                        </div>
                      </button>
                      {isOpen && (
                        <table className="w-full text-xs border-collapse border-t border-white/10">
                          <thead>
                            <tr className="bg-black/30">
                              <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Source</th>
                              <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Qty</th>
                              <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mRows.map((r, i) => (
                              <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                                <td className="px-4 py-2 text-white/70">{r.source}</td>
                                <td className="px-4 py-2 text-right text-white/40">{r.qty.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold text-orange-400">{fmt(r.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Units Committed</div>
                <div className="text-white font-bold text-xl">{sources.reduce((s, r) => s + r.qty, 0).toLocaleString()}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Revenue</div>
                <div className="text-orange-400 font-bold text-xl">{fmt(totals.revenue || totals.total)}</div>
              </div>
            </div>

            {statuses.length === 0 && sources.length === 0 && rows.length === 0 ? (
              <div className="text-center text-white/30 py-12">
                No commit sale data{activeTab === 'today' ? ' for today' : ' this month'}. Sync from Finale or upload a Sales Order Summary.
              </div>
            ) : (
              <>
                {/* By Status (from uploaded summary) */}
                {statuses.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">By Status</h3>
                    <div className="border border-orange-900/20 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-white/40 text-xs uppercase tracking-wider bg-black/30">
                          <th className="px-5 py-2">Status</th><th className="px-5 py-2 text-right">Orders</th>
                          <th className="px-5 py-2 text-right">Subtotal</th><th className="px-5 py-2 text-right">Total</th>
                        </tr></thead>
                        <tbody>{statuses.map((r, i) => (
                          <tr key={i} className="border-t border-orange-900/10 hover:bg-white/[0.02]">
                            <td className="px-5 py-2.5">
                              <span className={cn('px-2 py-0.5 rounded text-xs font-bold uppercase',
                                r.status === 'Committed' ? 'bg-yellow-500/15 text-yellow-400' :
                                r.status === 'Completed' ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/50'
                              )}>{r.status}</span>
                            </td>
                            <td className="px-5 py-2.5 text-right text-white/70 font-mono">{r.orders}</td>
                            <td className="px-5 py-2.5 text-right text-white/50 font-mono">{fmt(r.subtotal)}</td>
                            <td className="px-5 py-2.5 text-right text-orange-400 font-mono font-bold">{fmt(r.total)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* By Source (from synced detail data) */}
                {sources.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">By Source</h3>
                    <div className="border border-orange-900/20 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-white/40 text-xs uppercase tracking-wider bg-black/30">
                          <th className="px-5 py-2">Source</th><th className="px-5 py-2 text-right">Qty</th>
                          <th className="px-5 py-2 text-right">Revenue</th>
                        </tr></thead>
                        <tbody>{sources.map((r, i) => (
                          <tr key={i} className="border-t border-orange-900/10 hover:bg-white/[0.02]">
                            <td className="px-5 py-2.5 text-white">{r.source}</td>
                            <td className="px-5 py-2.5 text-right text-white/70 font-mono">{r.qty.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right text-orange-400 font-mono font-bold">{fmt(r.revenue)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* By Product (from synced detail data) */}
                {products.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">By Product</h3>
                    <div className="border border-orange-900/20 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-white/40 text-xs uppercase tracking-wider bg-black/30">
                          <th className="px-5 py-2">Product</th><th className="px-5 py-2 text-right">Qty</th>
                          <th className="px-5 py-2 text-right">Revenue</th>
                        </tr></thead>
                        <tbody>{products.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-t border-orange-900/10 hover:bg-white/[0.02]">
                            <td className="px-5 py-2.5">
                              <div className="text-white text-sm">{r.product}</div>
                              <div className="text-white/30 text-xs font-mono">{r.product_id}</div>
                            </td>
                            <td className="px-5 py-2.5 text-right text-white/70 font-mono">{r.qty.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right text-orange-400 font-mono font-bold">{fmt(r.revenue)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {products.length > 50 && (
                        <div className="px-5 py-2 text-xs text-white/30 border-t border-orange-900/10">
                          Showing 50 of {products.length} products
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* By Category (from synced detail data) */}
                {categories.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">By Category</h3>
                    <div className="border border-orange-900/20 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-white/40 text-xs uppercase tracking-wider bg-black/30">
                          <th className="px-5 py-2">Category</th><th className="px-5 py-2 text-right">Qty</th>
                          <th className="px-5 py-2 text-right">Revenue</th>
                        </tr></thead>
                        <tbody>{categories.map((r, i) => (
                          <tr key={i} className="border-t border-orange-900/10 hover:bg-white/[0.02]">
                            <td className="px-5 py-2.5 text-white">{r.category}</td>
                            <td className="px-5 py-2.5 text-right text-white/70 font-mono">{r.qty.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right text-orange-400 font-mono font-bold">{fmt(r.revenue)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Order Details (from uploaded summary) */}
                {rows.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Order Details</h3>
                    <div className="border border-orange-900/20 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-white/40 text-xs uppercase tracking-wider bg-black/30">
                          <th className="px-5 py-2">Order ID</th><th className="px-5 py-2">Status</th>
                          <th className="px-5 py-2">Origin</th><th className="px-5 py-2 text-right">Subtotal</th>
                          <th className="px-5 py-2 text-right">Total</th>
                        </tr></thead>
                        <tbody>{rows.map((r, i) => (
                          <tr key={i} className="border-t border-orange-900/10 hover:bg-white/[0.02]">
                            <td className="px-5 py-2.5 text-white font-mono text-xs">{r.order_id}</td>
                            <td className="px-5 py-2.5">
                              <span className={cn('px-2 py-0.5 rounded text-xs font-bold uppercase',
                                r.status === 'Committed' ? 'bg-yellow-500/15 text-yellow-400' :
                                r.status === 'Completed' ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/50'
                              )}>{r.status}</span>
                            </td>
                            <td className="px-5 py-2.5 text-white/50">{r.origin}</td>
                            <td className="px-5 py-2.5 text-right text-white/50 font-mono">{fmt(r.subtotal)}</td>
                            <td className="px-5 py-2.5 text-right text-orange-400 font-mono font-bold">{fmt(r.total)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
