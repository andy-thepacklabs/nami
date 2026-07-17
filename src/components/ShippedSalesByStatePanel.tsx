'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { RefreshCw, ChevronDown, ChevronRight, MapPin, AlertTriangle, Zap } from 'lucide-react'

interface StateRow    { state: string; orders: number; qty: number; revenue: number }
interface ProductRow  { state: string; product_id: string; product: string; qty: number; revenue: number }
interface MonthStateRow { month_key: string; state: string; orders: number; qty: number; revenue: number }
interface MonthProductRow { month_key: string; state: string; product_id: string; product: string; qty: number; revenue: number }
interface Meta { last_import: string | null; total: number }

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ShippedSalesByStatePanel() {
  const [thisMonthAgg, setThisMonthAgg]         = useState<StateRow[]>([])
  const [thisMonthProducts, setThisMonthProducts] = useState<ProductRow[]>([])
  const [byMonthAgg, setByMonthAgg]             = useState<MonthStateRow[]>([])
  const [byMonthProducts, setByMonthProducts]   = useState<MonthProductRow[]>([])
  const [meta, setMeta]     = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'today' | 'thismonth' | 'bymonth'>('today')
  const [todayAgg, setTodayAgg]               = useState<StateRow[]>([])
  const [todayProducts, setTodayProducts]     = useState<ProductRow[]>([])
  const [todayLoaded, setTodayLoaded]         = useState(false)
  const [expandedStates, setExpandedStates]   = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths]   = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState<string | null>(null)

  async function loadToday() {
    setLoading(true); setError(null)
    try {
      const data = await fetch('/api/shipped-sales-by-state?mode=today').then(r => r.json())
      setTodayAgg(data.agg ?? []); setTodayProducts(data.products ?? [])
      setMeta(data.meta ?? null); setTodayLoaded(true)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  async function loadThisMonth() {
    setLoading(true); setError(null)
    try {
      const data = await fetch('/api/shipped-sales-by-state').then(r => r.json())
      setThisMonthAgg(data.agg ?? [])
      setThisMonthProducts(data.products ?? [])
      setMeta(data.meta ?? null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  async function loadByMonth() {
    setLoading(true); setError(null)
    try {
      const data = await fetch('/api/shipped-sales-by-state?mode=bymonth').then(r => r.json())
      setByMonthAgg(data.agg ?? [])
      setByMonthProducts(data.products ?? [])
      setMeta(data.meta ?? null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadToday() }, [])
  useEffect(() => {
    if (activeTab === 'today' && !todayLoaded) loadToday()
    if (activeTab === 'bymonth' && byMonthAgg.length === 0) loadByMonth()
    if (activeTab === 'thismonth' && thisMonthAgg.length === 0) loadThisMonth()
  }, [activeTab])

  async function handleHistoricalSync() {
    setSyncing(true); setSyncMsg(null); setError(null)
    try {
      await fetch('/api/shipped-sales-by-product-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historical: true }),
      })
      const poll = async () => {
        try {
          const p = await fetch('/api/shipped-sales-by-product-sync').then(r => r.json())
          if (p.status === 'done') {
            setSyncMsg(`Synced Jan–Jun 2026`)
            setByMonthAgg([]); setByMonthProducts([])
            await loadByMonth()
            setSyncing(false)
          } else if (p.status === 'error') {
            setError(p.error ?? 'Sync failed'); setSyncing(false)
          } else {
            setSyncMsg(p.progress ?? 'Syncing…')
            setTimeout(poll, 2500)
          }
        } catch { setTimeout(poll, 2500) }
      }
      setTimeout(poll, 2000)
    } catch (e) { setError(String(e)); setSyncing(false) }
  }

  function toggleState(key: string) {
    setExpandedStates(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleMonth(key: string) {
    setExpandedMonths(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // ── This Month ────────────────────────────────────────────────────────────
  const baseStateAgg = activeTab === 'today' ? todayAgg : thisMonthAgg
  const baseStateProducts = activeTab === 'today' ? todayProducts : thisMonthProducts

  const filteredStates = useMemo(() => {
    if (!search) return baseStateAgg
    const q = search.toLowerCase()
    return baseStateAgg.filter(r =>
      r.state.toLowerCase().includes(q) ||
      baseStateProducts.some(p => p.state === r.state && (p.product.toLowerCase().includes(q) || p.product_id.toLowerCase().includes(q)))
    )
  }, [baseStateAgg, baseStateProducts, search])

  // product lookup: state → rows
  const productsByState = useMemo(() => {
    const map = new Map<string, ProductRow[]>()
    for (const p of baseStateProducts) {
      if (!map.has(p.state)) map.set(p.state, [])
      map.get(p.state)!.push(p)
    }
    return map
  }, [baseStateProducts])

  // ── By Month ──────────────────────────────────────────────────────────────
  const monthMap = useMemo(() => {
    const q = search.toLowerCase()
    const map = new Map<string, MonthStateRow[]>()
    for (const r of byMonthAgg) {
      if (search && !r.state.toLowerCase().includes(q) &&
          !byMonthProducts.some(p => p.month_key === r.month_key && p.state === r.state &&
            (p.product.toLowerCase().includes(q) || p.product_id.toLowerCase().includes(q)))) continue
      const label = monthLabel(r.month_key)
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(r)
    }
    return map
  }, [byMonthAgg, byMonthProducts, search])

  const monthProductMap = useMemo(() => {
    const map = new Map<string, MonthProductRow[]>() // key: `${month_key}|${state}`
    for (const p of byMonthProducts) {
      const key = `${p.month_key}|${p.state}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [byMonthProducts])

  const hasData = activeTab === 'bymonth' ? byMonthAgg.length > 0 : baseStateAgg.length > 0
  const statRevenue = activeTab === 'bymonth'
    ? byMonthAgg.reduce((s, r) => s + r.revenue, 0)
    : filteredStates.reduce((s, r) => s + r.revenue, 0)
  const statOrders = activeTab === 'bymonth'
    ? byMonthAgg.reduce((s, r) => s + r.orders, 0)
    : filteredStates.reduce((s, r) => s + r.orders, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(['today', 'thismonth', 'bymonth'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t ? 'bg-orange-500/15 text-orange-400' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              {t === 'today' ? 'Today' : t === 'thismonth' ? 'This Month Sale' : 'By Month'}
            </button>
          ))}
          <p className="text-white/20 text-xs ml-3">
            {meta?.last_import
              ? `Updated ${new Date(meta.last_import).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'No data — sync from Shipped Sales by Product first'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search state or product…"
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 w-48" />
          )}
          {activeTab === 'bymonth' && (
            <button onClick={handleHistoricalSync} disabled={syncing}
              className="flex items-center gap-1.5 text-xs bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/30 rounded px-3 py-1.5 transition-colors font-semibold">
              <Zap className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? (syncMsg ?? 'Syncing…') : 'Sync Jan–Jun 2026'}
            </button>
          )}
          <button onClick={() => activeTab === 'bymonth' ? loadByMonth() : activeTab === 'today' ? loadToday() : loadThisMonth()} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {syncMsg && !syncing && (
        <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-4 py-2 text-green-400 text-xs">{syncMsg}</div>
      )}
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {hasData && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Orders</div>
            <div className="text-white font-bold text-xl">{statOrders.toLocaleString()}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Revenue</div>
            <div className="text-green-400 font-bold text-xl">{fmtMoney(statRevenue)}</div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-white/20">
            <MapPin className="w-12 h-12" />
            <div className="text-center">
              <p className="text-sm font-semibold text-white/40 mb-1">No state data yet</p>
              <p className="text-xs">Sync data in "Shipped Sales by Product" first</p>
            </div>
          </div>
        ) : activeTab !== 'bymonth' ? (
          /* ── THIS MONTH: expandable state → products ── */
          <div className="border border-white/10 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] text-[10px] uppercase tracking-widest text-white/30 font-medium px-4 py-2.5 border-b border-white/10 bg-[#0d0d0d]">
              <span>State</span>
              <span className="text-right">Orders</span>
              <span className="text-right">Qty Shipped</span>
              <span className="text-right">Total Revenue</span>
            </div>
            {filteredStates.map((r) => {
              const stateProducts = productsByState.get(r.state) ?? []
              const isOpen = expandedStates.has(r.state)
              return (
                <div key={r.state} className="border-b border-white/5 last:border-0">
                  {/* State row */}
                  <button
                    onClick={() => toggleState(r.state)}
                    className="w-full grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="flex items-center gap-2 text-white/80 font-semibold text-xs">
                      {stateProducts.length > 0
                        ? isOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
                        : <span className="w-3.5" />
                      }
                      {r.state}
                      {stateProducts.length > 0 && <span className="text-white/20 text-[10px] font-normal">{stateProducts.length} products</span>}
                    </span>
                    <span className="text-right text-white/50 text-xs">{r.orders.toLocaleString()}</span>
                    <span className="text-right text-white/50 text-xs">{r.qty.toLocaleString()}</span>
                    <span className="text-right font-mono font-bold text-xs text-green-400">{r.revenue > 0 ? fmtMoney(r.revenue) : '—'}</span>
                  </button>
                  {/* Product sub-rows */}
                  {isOpen && stateProducts.length > 0 && (
                    <div className="bg-white/[0.02] border-t border-white/5">
                      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] text-[10px] uppercase tracking-widest text-white/20 px-4 py-1.5 border-b border-white/5">
                        <span className="pl-6">Product ID / Description</span>
                        <span />
                        <span className="text-right">Qty</span>
                        <span className="text-right">Revenue</span>
                      </div>
                      {stateProducts.map((p, i) => (
                        <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-2 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03]">
                          <div className="pl-6 flex flex-col gap-0.5 min-w-0">
                            <span className="font-mono text-orange-400/70 text-[11px]">{p.product_id}</span>
                            <span className="text-white/50 text-[11px] truncate">{p.product}</span>
                          </div>
                          <span />
                          <span className="text-right text-white/40 text-xs">{p.qty.toLocaleString()}</span>
                          <span className="text-right font-mono text-xs font-bold text-green-400">{p.revenue > 0 ? fmtMoney(p.revenue) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : monthMap.size === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">No results match your search</div>
        ) : (
          /* ── BY MONTH: month → state (expandable) → products ── */
          Array.from(monthMap.entries()).map(([month, stateRows]) => {
            const monthKey  = byMonthAgg.find(r => monthLabel(r.month_key) === month)?.month_key ?? ''
            const monthRev  = stateRows.reduce((s, r) => s + r.revenue, 0)
            const monthOrd  = stateRows.reduce((s, r) => s + r.orders, 0)
            const isMonthOpen = expandedMonths.has(month)
            return (
              <div key={month} className="border border-white/10 rounded-lg overflow-hidden">
                <button onClick={() => toggleMonth(month)}
                  className="w-full flex items-center px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left">
                  {isMonthOpen
                    ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                    : <ChevronRight className="w-4 h-4 text-white/40 shrink-0 mr-3" />}
                  <span className="text-white font-semibold text-sm flex-1">{month}</span>
                  <div className="flex items-center gap-8 text-xs">
                    <span className="text-white/40">{monthOrd.toLocaleString()} orders</span>
                    <span className="text-green-400 font-bold font-mono w-28 text-right">{fmtMoney(monthRev)}</span>
                  </div>
                </button>
                {isMonthOpen && (
                  <div className="border-t border-white/10">
                    {/* Column header */}
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] text-[10px] uppercase tracking-widest text-white/20 px-4 py-2 border-b border-white/5 bg-black/20">
                      <span>State</span>
                      <span className="text-right">Orders</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Revenue</span>
                    </div>
                    {stateRows.map((r) => {
                      const stateKey = `${monthKey}|${r.state}`
                      const stateProducts = monthProductMap.get(stateKey) ?? []
                      const isStateOpen   = expandedStates.has(stateKey)
                      return (
                        <div key={r.state} className="border-b border-white/[0.04] last:border-0">
                          <button onClick={() => toggleState(stateKey)}
                            className="w-full grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                            <span className="flex items-center gap-2 text-white/70 font-semibold text-xs">
                              {stateProducts.length > 0
                                ? isStateOpen ? <ChevronDown className="w-3 h-3 text-white/30 shrink-0" /> : <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />
                                : <span className="w-3" />}
                              {r.state}
                              {stateProducts.length > 0 && <span className="text-white/20 text-[10px] font-normal">{stateProducts.length} products</span>}
                            </span>
                            <span className="text-right text-white/40 text-xs">{r.orders.toLocaleString()}</span>
                            <span className="text-right text-white/40 text-xs">{r.qty.toLocaleString()}</span>
                            <span className="text-right font-mono font-bold text-xs text-green-400">{r.revenue > 0 ? fmtMoney(r.revenue) : '—'}</span>
                          </button>
                          {isStateOpen && stateProducts.length > 0 && (
                            <div className="bg-white/[0.015] border-t border-white/5">
                              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] text-[10px] uppercase tracking-widest text-white/15 px-4 py-1.5 border-b border-white/[0.03]">
                                <span className="pl-5">Product ID / Description</span>
                                <span /><span className="text-right">Qty</span><span className="text-right">Revenue</span>
                              </div>
                              {stateProducts.map((p, i) => (
                                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-1.5 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
                                  <div className="pl-5 flex flex-col gap-0.5 min-w-0">
                                    <span className="font-mono text-orange-400/60 text-[11px]">{p.product_id}</span>
                                    <span className="text-white/40 text-[11px] truncate">{p.product}</span>
                                  </div>
                                  <span />
                                  <span className="text-right text-white/30 text-xs">{p.qty.toLocaleString()}</span>
                                  <span className="text-right font-mono text-xs font-bold text-green-400">{p.revenue > 0 ? fmtMoney(p.revenue) : '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
