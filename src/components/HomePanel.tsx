'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, Package, AlertTriangle, DollarSign, BarChart2, ShoppingCart, Truck } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface HomeStats {
  totalValue: number
  totalSkus: number
  lowStock: number
  outOfStock: number
  outOfStockList: { product_id: string; product_name: string | null; category: string | null }[]
  byCategory: { category: string; total_qty: number; total_value: number; sku_count: number }[]
  reorderTop: { product_id: string; product_name: string | null; qoh: number; monthly_req: number; mo_on_hand: number }[]
  topConsumed: { product_id: string; product_name: string | null; consumed_90d: number; consumed_7d: number }[]
  topSelling: { product_id: string; product_name: string | null; sales_7d: number; sales_30d: number; sales_60d: number; sales_90d: number }[]
}

function fmt(v: number | null | undefined, dec = 0) {
  if (v == null) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtM(v: number | null | undefined) {
  if (v == null) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#eab308', '#ef4444', '#06b6d4']

function StatCard({
  icon, label, value, sub, color = 'text-white', onClick
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string; onClick?: () => void
}) {
  return (
    <div
      className={`bg-[#111] border border-orange-900/20 rounded-xl p-5 flex items-start gap-4 ${onClick ? 'cursor-pointer hover:border-orange-500/40 hover:bg-white/5 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="text-orange-500 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">{label}</div>
        <div className={`text-3xl font-black tracking-tight ${color}`}>{value}</div>
        {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
      </div>
    </div>
  )
}

export default function HomePanel() {
  const [data, setData] = useState<HomeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOos, setShowOos] = useState(false)
  const [oosSearch, setOosSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/home/stats')
      setData(await res.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => {
    load()
    window.addEventListener('finale-synced', load)
    return () => window.removeEventListener('finale-synced', load)
  }, [])

  const rawPie = (data?.byCategory ?? []).filter(c => c.total_qty > 0)
  const totalQty = rawPie.reduce((s, c) => s + c.total_qty, 0)
  const pieData = rawPie.map(c => ({
    name: c.category,
    value: Math.round(c.total_qty),
    pct: totalQty > 0 ? Math.round((c.total_qty / totalQty) * 100) : 0,
    total_qty: c.total_qty,
    total_value: c.total_value,
    skus: c.sku_count,
  }))

  return (
    <>
    <div className="flex-1 overflow-auto p-6 space-y-6 bg-black">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-white/40 mt-0.5">Real-time inventory overview from Finale</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatCard
          icon={<DollarSign className="w-6 h-6" />}
          label="Total Inventory Value"
          value={data ? fmtM(data.totalValue) : '—'}
          sub="Based on average cost × QoH"
        />
        <StatCard
          icon={<Package className="w-6 h-6" />}
          label="Total SKUs"
          value={data ? fmt(data.totalSkus) : '—'}
          sub="Unique product IDs in stock"
        />
        <StatCard
          icon={<AlertTriangle className="w-6 h-6" />}
          label="Low Stock SKUs"
          value={data ? fmt(data.lowStock) : '—'}
          sub="Mo on hand < 2 months"
          color="text-amber-400"
        />
        <StatCard
          icon={<AlertTriangle className="w-6 h-6" />}
          label="Out of Stock SKUs"
          value={data ? fmt(data.outOfStock) : '—'}
          sub="QoH = 0 · Click to view"
          color="text-red-400"
          onClick={() => { setOosSearch(''); setShowOos(true) }}
        />
        <StatCard
          icon={<ShoppingCart className="w-6 h-6" />}
          label="Open POs"
          value="—"
          sub="Not yet connected"
          color="text-orange-700"
        />
        <div className="bg-[#111] border border-orange-900/20 rounded-xl p-5 flex items-start gap-4">
          <div className="text-orange-500 mt-0.5"><Truck className="w-6 h-6" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">On-Time Delivery</div>
            <div className="space-y-1.5">
              {[['Last 7d', '—'], ['Last 30d', '—'], ['Last 90d', '—']].map(([period, val]) => (
                <div key={period} className="flex items-center justify-between">
                  <span className="text-xs text-white/30">{period}</span>
                  <span className="text-sm font-bold text-white/20 font-mono">{val}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-white/20 mt-2">Not yet connected</div>
          </div>
        </div>
      </div>

      {/* Charts + tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">

        {/* Inventory by Category donut */}
        <div className="bg-[#111] border border-orange-900/20 rounded-xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white/70 mb-4">Inventory by Category</h2>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-6">
              {/* Donut */}
              <div className="shrink-0" style={{ width: 160, height: 160 }}>
                <PieChart width={160} height={160}>
                  <Pie
                    data={pieData}
                    cx={80}
                    cy={80}
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, _n, props) => [`${props.payload.pct}% · ${Number(v).toLocaleString()} units`, props.payload.name]}
                    contentStyle={{ background: '#111', border: '1px solid #431407', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  />
                </PieChart>
              </div>
              {/* Legend */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Header */}
                <div className="flex items-center gap-2 pb-1.5 mb-0.5 border-b border-white/10">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex-1">Category</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30 w-24 text-right">Units</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30 w-16 text-right">Value</span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/30 w-10 text-right">%</span>
                </div>
                {pieData.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-sm text-white/80 font-semibold flex-1 truncate">{c.name}</span>
                    <span className="text-sm font-mono text-white/50 w-24 text-right">{Math.round(c.total_qty).toLocaleString()}</span>
                    <span className="text-sm font-mono text-white/50 w-16 text-right">{fmtM(c.total_value)}</span>
                    <span className="text-sm font-bold font-mono text-white w-10 text-right">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-orange-900">
              Sync Finale to see data
            </div>
          )}
        </div>

        {/* Top Reorder */}
        <div className="bg-[#111] border border-orange-900/20 rounded-xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white/70 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />Top SKU Need to Re-Order
          </h2>
          {(data?.reorderTop ?? []).length === 0 ? (
            <div className="text-sm text-orange-900">No items below 2 months on hand.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-orange-900/30">
                  <th className="text-left pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">SKU</th>
                  <th className="text-right pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">QoH</th>
                  <th className="text-right pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">Mo Req</th>
                  <th className="text-right pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">Mo On Hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-900/10">
                {(data?.reorderTop ?? []).map(r => {
                  const color = r.mo_on_hand < 1 ? 'text-red-400' : 'text-amber-400'
                  return (
                    <tr key={r.product_id} className="hover:bg-orange-500/5">
                      <td className="py-2">
                        <div className="font-mono text-orange-300 font-semibold">{r.product_id}</div>
                        {r.product_name && <div className="text-xs text-white/40 truncate max-w-[140px]">{r.product_name}</div>}
                      </td>
                      <td className="py-2 text-right font-mono text-white">{fmt(r.qoh)}</td>
                      <td className="py-2 text-right font-mono text-orange-300">{fmt(r.monthly_req, 1)}</td>
                      <td className={`py-2 text-right font-mono font-bold ${color}`}>{r.mo_on_hand.toFixed(1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Consumed */}
        <div className="bg-[#111] border border-orange-900/20 rounded-xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white/70 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />Top Consumed Items
          </h2>
          {(data?.topConsumed ?? []).length === 0 ? (
            <div className="text-sm text-orange-900">No consumed data — sync Finale first.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-orange-900/30">
                  <th className="text-left pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">SKU</th>
                  <th className="text-right pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">Used (7d)</th>
                  <th className="text-right pb-2 text-xs font-extrabold uppercase tracking-widest text-white/40">Used (90d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-900/10">
                {(data?.topConsumed ?? []).map(r => (
                  <tr key={r.product_id} className="hover:bg-orange-500/5">
                    <td className="py-2">
                      <div className="font-mono text-orange-300 font-semibold">{r.product_id}</div>
                      {r.product_name && <div className="text-xs text-white/40 truncate max-w-[140px]">{r.product_name}</div>}
                    </td>
                    <td className="py-2 text-right font-mono text-sky-400">{fmt(r.consumed_7d)}</td>
                    <td className="py-2 text-right font-mono text-amber-400 font-bold">{fmt(r.consumed_90d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* Top Selling row */}
      {(data?.topSelling ?? []).length > 0 && (
        <div className="bg-[#111] border border-orange-900/20 rounded-xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white/70 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />Top Selling SKUs
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left pb-3 px-3 text-sm font-extrabold uppercase tracking-widest text-white/40">#</th>
                <th className="text-left pb-3 px-3 text-sm font-extrabold uppercase tracking-widest text-white/40">SKU</th>
                <th className="text-right pb-3 px-3 text-sm font-extrabold uppercase tracking-widest text-white/40">Sale 7d</th>
                <th className="text-right pb-3 px-3 text-sm font-extrabold uppercase tracking-widest text-white/40">Sale 30d</th>
                <th className="text-right pb-3 px-3 text-sm font-extrabold uppercase tracking-widest text-white/40">Sale 60d</th>
                <th className="text-right pb-3 px-3 text-sm font-extrabold uppercase tracking-widest text-white/40">Sale 90d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(data?.topSelling ?? []).map((r, i) => (
                <tr key={r.product_id} className="hover:bg-white/5">
                  <td className="py-3 px-3 text-white/30 font-bold text-base">{i + 1}</td>
                  <td className="py-3 px-3">
                    <div className="font-mono text-orange-300 font-semibold text-base">{r.product_id}</div>
                    {r.product_name && <div className="text-sm text-white/40 mt-0.5">{r.product_name}</div>}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-base text-white/60">{fmt(r.sales_7d)}</td>
                  <td className="py-3 px-3 text-right font-mono text-base text-white/60">{fmt(r.sales_30d)}</td>
                  <td className="py-3 px-3 text-right font-mono text-base text-white/60">{fmt(r.sales_60d)}</td>
                  <td className="py-3 px-3 text-right font-mono text-base text-emerald-400 font-bold">{fmt(r.sales_90d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>

    {/* Out of Stock modal */}
    {showOos && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowOos(false)}>
        <div className="bg-[#111] border border-orange-900/30 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-orange-900/20 shrink-0">
            <div>
              <div className="text-sm font-extrabold uppercase tracking-widest text-red-400">Out of Stock SKUs</div>
              <div className="text-xs text-white/30 mt-0.5">{(data?.outOfStockList ?? []).length} products · QoH = 0</div>
            </div>
            <button onClick={() => setShowOos(false)} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
          </div>
          <div className="px-5 py-3 border-b border-orange-900/10 shrink-0">
            <input
              autoFocus
              type="text"
              placeholder="Search SKU or name…"
              value={oosSearch}
              onChange={e => setOosSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/40"
            />
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#111]">
                <tr className="border-b border-white/10">
                  <th className="text-left px-5 py-3 font-extrabold uppercase tracking-widest text-white/40">Product ID</th>
                  <th className="text-left px-5 py-3 font-extrabold uppercase tracking-widest text-white/40">Name</th>
                  <th className="text-left px-5 py-3 font-extrabold uppercase tracking-widest text-white/40">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(data?.outOfStockList ?? [])
                  .filter(r => !oosSearch || r.product_id.toLowerCase().includes(oosSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(oosSearch.toLowerCase()))
                  .map(r => (
                    <tr key={r.product_id} className="hover:bg-white/5">
                      <td className="px-5 py-2.5 font-mono font-semibold text-red-400">{r.product_id}</td>
                      <td className="px-5 py-2.5 text-white/60">{r.product_name || '—'}</td>
                      <td className="px-5 py-2.5 text-white/30">{r.category || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
