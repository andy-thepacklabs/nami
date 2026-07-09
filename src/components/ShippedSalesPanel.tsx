'use client'

import { useState, useEffect, useRef } from 'react'
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
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtDate(s: string) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getMonthKey(dateStr: string) {
  if (!dateStr) return 'Unknown'
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
      const res = await fetch('/api/shipped-sales-sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSyncMsg(`Synced ${data.orderCount} orders (${data.dateRange})`)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
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

  const thisMonthRows = rows.filter(r => getMonthKey(r.ship_date || r.order_date) === THIS_MONTH_KEY)

  const sourceRows = activeTab === 'thismonth' ? thisMonthRows : rows

  const filtered = sourceRows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.order_id.toLowerCase().includes(q) ||
      (r.customer ?? '').toLowerCase().includes(q) ||
      (r.product_id ?? '').toLowerCase().includes(q) ||
      (r.product_name ?? '').toLowerCase().includes(q)
  })

  // Group by ship month (fall back to order_date)
  const monthMap = new Map<string, SaleRow[]>()
  for (const r of filtered) {
    const key = getMonthKey(r.ship_date || r.order_date)
    if (!monthMap.has(key)) monthMap.set(key, [])
    monthMap.get(key)!.push(r)
  }

  // For This Month: group by order
  const thisMonthOrders = new Map<string, SaleRow[]>()
  for (const r of filtered) {
    const key = r.order_id || '—'
    if (!thisMonthOrders.has(key)) thisMonthOrders.set(key, [])
    thisMonthOrders.get(key)!.push(r)
  }

  // Group by order within a month for subtotal display
  function groupByOrder(monthRows: SaleRow[]) {
    const map = new Map<string, SaleRow[]>()
    for (const r of monthRows) {
      const key = r.order_id || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return map
  }

  const totalRevenue    = filtered.reduce((s, r) => s + (r.subtotal || r.qty_shipped * r.unit_price), 0)
  const totalOrders     = new Set(filtered.map(r => r.order_id)).size
  const uniqueCustomers = new Set(filtered.map(r => r.customer)).size

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
              {syncing ? 'Syncing…' : 'Sync from Finale'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
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
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Orders</div>
            <div className="text-white font-bold text-xl">{totalOrders}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Unique Customers</div>
            <div className="text-sky-400 font-bold text-xl">{uniqueCustomers}</div>
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
          /* ── This Month flat order table ── */
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0d0d0d] z-10">
                <tr>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Order #</th>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Customer</th>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Order Date</th>
                  <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Ship Date</th>
                  <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Lines</th>
                  <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Order Total</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(thisMonthOrders.entries()).map(([orderId, orderRows]) => {
                  const first = orderRows[0]
                  const orderTotal = orderRows.reduce((s, r) => s + (r.subtotal || r.qty_shipped * r.unit_price), 0)
                  return (
                    <tr key={orderId} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 font-mono text-orange-400 font-semibold">{orderId}</td>
                      <td className="px-4 py-2.5 text-white/60 max-w-[200px]"><span className="truncate block">{first.customer || '—'}</span></td>
                      <td className="px-4 py-2.5 text-white/40">{fmtDate(first.order_date)}</td>
                      <td className="px-4 py-2.5 text-white/60">{fmtDate(first.ship_date)}</td>
                      <td className="px-4 py-2.5 text-right text-white/40">{orderRows.length}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-green-400">{orderTotal > 0 ? fmtMoney(orderTotal) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : monthMap.size === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">No results match your search</div>
        ) : (
          Array.from(monthMap.entries()).map(([month, monthRows]) => {
            const monthRevenue = monthRows.reduce((s, r) => s + (r.subtotal || r.qty_shipped * r.unit_price), 0)
            const orderGroups = groupByOrder(monthRows)
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
                    <span className="text-white/40">{orderGroups.size} orders</span>
                    <span className="text-white/40">{new Set(monthRows.map(r => r.customer)).size} customers</span>
                    <span className="text-green-400 font-bold font-mono w-20 text-right">{fmtMoney(monthRevenue)}</span>
                  </div>
                </button>

                {/* Expanded: one row per order */}
                {isOpen && (
                  <table className="w-full text-xs border-collapse border-t border-white/10">
                    <thead>
                      <tr className="bg-black/30">
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Order #</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Customer</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Order Date</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Ship Date</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Lines</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Order Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(orderGroups.entries()).map(([orderId, orderRows]) => {
                        const first = orderRows[0]
                        const orderTotal = orderRows.reduce((s, r) => s + (r.subtotal || r.qty_shipped * r.unit_price), 0)
                        return (
                          <tr key={orderId} className="border-t border-white/5 hover:bg-white/[0.03]">
                            <td className="px-4 py-2 font-mono text-orange-400 font-semibold">{orderId}</td>
                            <td className="px-4 py-2 text-white/60 max-w-[200px]">
                              <span className="truncate block">{first.customer || '—'}</span>
                            </td>
                            <td className="px-4 py-2 text-white/40">{fmtDate(first.order_date)}</td>
                            <td className="px-4 py-2 text-white/60">{fmtDate(first.ship_date)}</td>
                            <td className="px-4 py-2 text-right text-white/40">{orderRows.length}</td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-green-400">
                              {orderTotal > 0 ? fmtMoney(orderTotal) : '—'}
                            </td>
                          </tr>
                        )
                      })}
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
