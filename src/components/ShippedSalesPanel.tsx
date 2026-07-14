'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { RefreshCw, TrendingUp, AlertTriangle, ChevronDown, ChevronRight, Upload, Zap } from 'lucide-react'

interface SaleRow {
  order_id: string
  customer: string
  order_date: string
  ship_date: string
  product_id: string
  product_name: string
  category: string
  qty_shipped: number
  unit_price: number
  subtotal: number
}

interface Meta {
  last_import: string | null
  total: number
}

function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(s: string) {
  if (!s) return '—'
  // Parse YYYY-MM-DD as local to avoid UTC→local shift (new Date("2026-07-01") = Jun 30 local)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = iso
    ? new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
    : new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getMonthKey(dateStr: string) {
  if (!dateStr) return 'Unknown'
  // Parse YYYY-MM-DD directly to avoid UTC→local timezone shift (new Date("2026-07-01") = June 30 local)
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ShippedSalesPanel() {
  const [rows, setRows] = useState<SaleRow[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'thismonth' | 'bymonth'>('thismonth')
  const fileRef = useRef<HTMLInputElement>(null)

  const NOW = new Date()
  const THIS_MONTH_KEY = NOW.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/shipped-sales-upload')
      const data = await res.json()
      setRows(data.rows ?? [])
      setMeta(data.meta ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    setError(null)
    try {
      // Fire-and-forget POST — returns immediately
      const res = await fetch('/api/shipped-sales-sync', { method: 'POST' })
      const data = await res.json()
      if (data.reason === 'already syncing' || data.started === false) {
        // Already running — just poll
      } else if (data.error) {
        setError(data.error)
        setSyncing(false)
        return
      }

      // Poll progress every 2s until done
      const poll = async () => {
        try {
          const p = await fetch('/api/shipped-sales-sync?progress=1').then(r => r.json())
          if (p.status === 'done') {
            setSyncMsg(`Synced ${p.count.toLocaleString()} orders · ${p.pages} pages · ${p.mode === 'incremental' ? '⚡ incremental' : '🔍 full scan (faster next time)'}`)
            await load()
            setSyncing(false)
          } else if (p.status === 'error') {
            setError(p.error ?? 'Sync failed')
            setSyncing(false)
          } else {
            setSyncMsg(`Page ${p.pages ?? '…'} · ${(p.count ?? 0).toLocaleString()} this-month orders found`)
            setTimeout(poll, 2000)
          }
        } catch {
          setTimeout(poll, 2000)
        }
      }
      setTimeout(poll, 2000)
    } catch (e) {
      setError(String(e))
      setSyncing(false)
    }
  }

  async function handleHistoricalSync() {
    setSyncing(true)
    setSyncMsg(null)
    setError(null)
    try {
      const res = await fetch('/api/shipped-sales-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historical: true }),
      })
      const data = await res.json()
      if (!data.started && data.reason !== 'already syncing') {
        setError(data.error ?? 'Failed to start')
        setSyncing(false)
        return
      }
      const poll = async () => {
        try {
          const p = await fetch('/api/shipped-sales-sync').then(r => r.json())
          if (p.status === 'done') {
            setSyncMsg(`Synced ${p.count.toLocaleString()} orders across Jan–Jun 2026`)
            await load()
            setSyncing(false)
          } else if (p.status === 'error') {
            setError(p.error ?? 'Sync failed')
            setSyncing(false)
          } else {
            setSyncMsg(p.progress ?? 'Syncing…')
            setTimeout(poll, 2500)
          }
        } catch { setTimeout(poll, 2500) }
      }
      setTimeout(poll, 2000)
    } catch (e) {
      setError(String(e))
      setSyncing(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/shipped-sales-upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function toggleMonth(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Pre-tag every row with its month key once (avoids repeated regex in render)
  const taggedRows = useMemo(() =>
    rows.map(r => ({ ...r, _monthKey: getMonthKey(r.ship_date || r.order_date) })),
    [rows]
  )

  const thisMonthRows = useMemo(() =>
    taggedRows.filter(r => r._monthKey === THIS_MONTH_KEY),
    [taggedRows, THIS_MONTH_KEY]
  )

  const sourceRows = activeTab === 'thismonth' ? thisMonthRows : taggedRows

  const filtered = useMemo(() => {
    if (!search) return sourceRows
    const q = search.toLowerCase()
    return sourceRows.filter(r =>
      r.order_id.toLowerCase().includes(q) ||
      (r.customer ?? '').toLowerCase().includes(q) ||
      (r.product_id ?? '').toLowerCase().includes(q) ||
      (r.product_name ?? '').toLowerCase().includes(q)
    )
  }, [sourceRows, search])

  // Group by ship month for By Month view
  const monthMap = useMemo(() => {
    const map = new Map<string, typeof taggedRows>()
    for (const r of filtered) {
      if (!map.has(r._monthKey)) map.set(r._monthKey, [])
      map.get(r._monthKey)!.push(r)
    }
    return map
  }, [filtered])

  // Group by source for This Month view
  const sortedSources = useMemo(() => {
    const bySource = new Map<string, typeof filtered>()
    for (const r of filtered) {
      const key = r.customer && r.customer !== '—' ? r.customer : 'Unknown'
      if (!bySource.has(key)) bySource.set(key, [])
      bySource.get(key)!.push(r)
    }
    return Array.from(bySource.entries()).sort(
      (a, b) => b[1].reduce((s, r) => s + r.subtotal, 0) - a[1].reduce((s, r) => s + r.subtotal, 0)
    )
  }, [filtered])

  // Pre-compute per-month source groupings for By Month view
  const monthSourceMap = useMemo(() => {
    const result = new Map<string, { source: string; orders: number; revenue: number }[]>()
    for (const [month, monthRows] of monthMap.entries()) {
      const srcMap = new Map<string, { orders: Set<string>; revenue: number }>()
      for (const r of monthRows) {
        const src = r.customer || '—'
        if (!srcMap.has(src)) srcMap.set(src, { orders: new Set(), revenue: 0 })
        const s = srcMap.get(src)!
        s.orders.add(r.order_id)
        s.revenue += r.subtotal
      }
      result.set(month, Array.from(srcMap.entries())
        .map(([source, { orders, revenue }]) => ({ source, orders: orders.size, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
      )
    }
    return result
  }, [monthMap])

  // Group by order within a source for This Month expand
  function groupByOrder(monthRows: SaleRow[]) {
    const map = new Map<string, SaleRow[]>()
    for (const r of monthRows) {
      const key = r.order_id || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return map
  }

  const totalRevenue    = useMemo(() => filtered.reduce((s, r) => s + (r.subtotal || r.qty_shipped * r.unit_price), 0), [filtered])
  const totalOrders     = useMemo(() => new Set(filtered.map(r => r.order_id)).size, [filtered])
  const uniqueCustomers = useMemo(() => new Set(filtered.map(r => r.customer)).size, [filtered])

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
            {meta?.last_import ? `Updated ${fmtDate(meta.last_import)}` : 'No data uploaded'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search order, customer, SKU…"
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 w-48"
            />
          )}
          {activeTab === 'thismonth' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-xs bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/30 rounded px-3 py-1.5 transition-colors font-semibold"
            >
              <Zap className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? `Syncing… ${syncMsg ? '· ' + syncMsg : ''}` : 'Sync from Finale'}
            </button>
          )}
          {activeTab === 'bymonth' && (
            <button
              onClick={handleHistoricalSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-xs bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/30 rounded px-3 py-1.5 transition-colors font-semibold"
            >
              <Zap className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? `${syncMsg ?? 'Syncing…'}` : 'Sync Jan–Jun 2026'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
          >
            <Upload className={`w-3.5 h-3.5 ${uploading ? 'animate-pulse' : ''}`} />
            {uploading ? 'Importing…' : 'Upload CSV'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Shipped Orders</div>
            <div className="text-white font-bold text-xl">{totalOrders}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Revenue</div>
            <div className="text-green-400 font-bold text-xl">{fmtMoney(totalRevenue)}</div>
          </div>
        </div>
      )}

      {/* Sync success */}
      {syncMsg && (
        <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-4 py-2 text-green-400 text-xs">{syncMsg}</div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-white/20">
            <TrendingUp className="w-12 h-12" />
            <div className="text-center">
              <p className="text-sm font-semibold text-white/40 mb-1">No data yet</p>
              <p className="text-xs">Export a shipped sales report from Finale and upload the CSV above</p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-white/60 hover:text-white hover:border-white/30 text-sm transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload CSV
            </button>
          </div>
        ) : activeTab === 'thismonth' ? (
          /* ── This Month grouped by Source ── */
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0d0d0d] z-10">
                <tr>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium w-8"></th>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Source</th>
                  <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Orders</th>
                  <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sortedSources.map(([source, srcRows]) => {
                  const srcTotal  = srcRows.reduce((s, r) => s + r.subtotal, 0)
                  const orderCount = new Set(srcRows.map(r => r.order_id)).size
                  const isOpen    = expanded.has(source)
                  const orderMap  = groupByOrder(srcRows)
                  return (
                    <React.Fragment key={source}>
                      <tr
                        onClick={() => toggleMonth(source)}
                        className="border-b border-white/5 hover:bg-white/[0.04] cursor-pointer"
                      >
                        <td className="px-4 py-3 text-white/30">
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{source}</td>
                        <td className="px-4 py-3 text-right text-white/50">{orderCount}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-green-400">{srcTotal > 0 ? fmtMoney(srcTotal) : '—'}</td>
                      </tr>
                      {isOpen && Array.from(orderMap.entries()).map(([orderId, orderRows]) => {
                        const orderTotal = orderRows.reduce((s, r) => s + r.subtotal, 0)
                        const first = orderRows[0]
                        return (
                          <tr key={orderId} className="border-b border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.03]">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 font-mono text-orange-400/80 text-[11px]">
                              {orderId}
                              <span className="ml-3 text-white/30">{fmtDate(first.ship_date || first.order_date)}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-white/30">{orderRows.length}</td>
                            <td className="px-4 py-2 text-right font-mono text-green-400/70">{orderTotal > 0 ? fmtMoney(orderTotal) : '—'}</td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : monthMap.size === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">No results match your search</div>
        ) : (
          Array.from(monthMap.entries()).map(([month, monthRows]) => {
            const sortedMonthSources = monthSourceMap.get(month) ?? []
            const monthRevenue = sortedMonthSources.reduce((s, r) => s + r.revenue, 0)
            const totalMonthOrders = sortedMonthSources.reduce((s, r) => s + r.orders, 0)
            const isOpen = expanded.has(month)

            return (
              <div key={month} className="border border-white/10 rounded-lg overflow-hidden">
                {/* Month row */}
                <button
                  onClick={() => toggleMonth(month)}
                  className="w-full flex items-center px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left"
                >
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                    : <ChevronRight className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                  }
                  <span className="text-white font-semibold text-sm flex-1">{month}</span>
                  <div className="flex items-center gap-8 text-xs">
                    <span className="text-white/40">{totalMonthOrders} orders</span>
                    <span className="text-green-400 font-bold font-mono w-20 text-right">{fmtMoney(monthRevenue)}</span>
                  </div>
                </button>

                {/* Expanded: one row per source */}
                {isOpen && (
                  <table className="w-full text-xs border-collapse border-t border-white/10">
                    <thead>
                      <tr className="bg-black/30">
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Source</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Orders</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMonthSources.map(({ source, orders, revenue }) => (
                        <tr key={source} className="border-t border-white/5 hover:bg-white/[0.03]">
                          <td className="px-4 py-2 text-white/70">{source}</td>
                          <td className="px-4 py-2 text-right text-white/40">{orders}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-green-400">
                            {revenue > 0 ? fmtMoney(revenue) : '—'}
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
