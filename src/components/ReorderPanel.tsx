'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, Package, AlertTriangle } from 'lucide-react'

interface TopSellingRow {
  product_id: string; product_name: string | null; category: string | null
  sales_90d: number; sales_30d: number | null; sales_7d: number | null
  sales_this_month: number | null; sales_last_month: number | null; qoh: number
}
interface TopConsumedRow {
  product_id: string; product_name: string | null; category: string | null
  consumed_90d: number; qoh: number; available: number
}
interface ReorderRow {
  product_id: string; product_name: string | null; category: string | null
  qoh: number; available: number; consumed_90d: number | null
  sales_90d: number | null; monthly_required: number | null; mo_on_hand: number | null
}
interface ReorderData {
  topSelling: TopSellingRow[]
  topConsumed: TopConsumedRow[]
  reorderRecs: ReorderRow[]
}

function fmt(v: number | null, dec = 0) {
  if (v == null) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function MoHBadge({ v }: { v: number | null }) {
  if (v == null) return <span className="text-orange-900">—</span>
  const color = v < 1 ? 'text-red-400' : v < 2 ? 'text-amber-400' : 'text-emerald-400'
  return <span className={`font-bold text-base ${color}`}>{v.toFixed(1)}</span>
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-white/50 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
)
const TD = ({ children, right, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) => (
  <td className={`px-3 py-2 text-base ${right ? 'text-right' : ''} ${className}`}>{children}</td>
)

function ProductCell({ id, name }: { id: string; name: string | null }) {
  return (
    <td className="px-3 py-2" title={name || id}>
      <div className="font-mono text-orange-300 text-base font-semibold">{id}</div>
      {name && <div className="text-sm text-white/50 mt-0.5">{name}</div>}
    </td>
  )
}

export default function ReorderPanel() {
  const [data, setData] = useState<ReorderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'reorder' | 'selling' | 'consumed'>('reorder')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reorder')
      setData(await res.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const tabs: { key: typeof section; label: string; icon: React.ReactNode }[] = [
    { key: 'reorder',  label: 'Reorder Recommendations', icon: <AlertTriangle className="w-4 h-4" /> },
    { key: 'selling',  label: 'Top 30 Selling SKUs',     icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'consumed', label: 'Top 30 Consumed',         icon: <Package className="w-4 h-4" /> },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
        <div className="flex items-center gap-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setSection(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors ${
                section === t.key ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading} className="text-orange-800 hover:text-orange-400 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
          <span className="text-base text-orange-400">Loading...</span>
        </div>
      )}

      {!loading && data && (
        <div className="flex-1 overflow-auto">

          {/* Reorder Recommendations */}
          {section === 'reorder' && (
            <>
              {data.reorderRecs.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-orange-900">No SKUs below 2 months on hand.</div>
              ) : (
                <table className="border-collapse">
                  <thead className="sticky top-0 bg-black z-10 border-b border-orange-900/30">
                    <tr>
                      <TH>Product ID</TH>
                      <TH>Category</TH>
                      <TH right>Stock QoH</TH>
                      <TH right>Available</TH>
                      <TH right>Consumed 90d</TH>
                      <TH right>Monthly Req</TH>
                      <TH right>Mo On Hand</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-900/10">
                    {data.reorderRecs.map(r => (
                      <tr key={r.product_id} className="hover:bg-orange-500/5 transition-colors">
                        <ProductCell id={r.product_id} name={r.product_name} />
                        <TD><span className="text-white/50 text-sm">{r.category || '—'}</span></TD>
                        <TD right className="font-mono tabular-nums text-white font-bold">{fmt(r.qoh)}</TD>
                        <TD right className="font-mono tabular-nums text-emerald-400">{fmt(r.available)}</TD>
                        <TD right className="font-mono tabular-nums text-amber-400">{fmt(r.consumed_90d)}</TD>
                        <TD right className="font-mono tabular-nums text-orange-300">{fmt(r.monthly_required, 1)}</TD>
                        <TD right><MoHBadge v={r.mo_on_hand} /></TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Top Selling */}
          {section === 'selling' && (
            <>
              {data.topSelling.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-orange-900">No sales data — sync Finale first.</div>
              ) : (
                <table className="border-collapse">
                  <thead className="sticky top-0 bg-black z-10 border-b border-orange-900/30">
                    <tr>
                      <TH>#</TH>
                      <TH>Product ID</TH>
                      <TH>Category</TH>
                      <TH right>Sale 7d</TH>
                      <TH right>Sale 30d</TH>
                      <TH right>Sale 90d</TH>
                      <TH right>This Month</TH>
                      <TH right>Last Month</TH>
                      <TH right>Stock QoH</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-900/10">
                    {data.topSelling.map((r, i) => (
                      <tr key={r.product_id} className="hover:bg-orange-500/5 transition-colors">
                        <TD><span className="text-orange-700 font-bold">{i + 1}</span></TD>
                        <ProductCell id={r.product_id} name={r.product_name} />
                        <TD><span className="text-white/50 text-sm">{r.category || '—'}</span></TD>
                        <TD right className="font-mono tabular-nums text-orange-300">{fmt(r.sales_7d)}</TD>
                        <TD right className="font-mono tabular-nums text-orange-300">{fmt(r.sales_30d)}</TD>
                        <TD right className="font-mono tabular-nums text-emerald-400 font-bold">{fmt(r.sales_90d)}</TD>
                        <TD right className="font-mono tabular-nums text-sky-400">{fmt(r.sales_this_month)}</TD>
                        <TD right className="font-mono tabular-nums text-sky-300">{fmt(r.sales_last_month)}</TD>
                        <TD right className="font-mono tabular-nums text-white">{fmt(r.qoh)}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Top Consumed */}
          {section === 'consumed' && (
            <>
              {data.topConsumed.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-orange-900">No consumed data — sync Finale first.</div>
              ) : (
                <table className="border-collapse">
                  <thead className="sticky top-0 bg-black z-10 border-b border-orange-900/30">
                    <tr>
                      <TH>#</TH>
                      <TH>Product ID</TH>
                      <TH>Category</TH>
                      <TH right>Consumed 90d</TH>
                      <TH right>Monthly Avg</TH>
                      <TH right>Stock QoH</TH>
                      <TH right>Available</TH>
                      <TH right>Mo On Hand</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-900/10">
                    {data.topConsumed.map((r, i) => {
                      const monthlyAvg = r.consumed_90d / 3
                      const moh = monthlyAvg > 0 ? r.qoh / monthlyAvg : null
                      return (
                        <tr key={r.product_id} className="hover:bg-orange-500/5 transition-colors">
                          <TD><span className="text-orange-700 font-bold">{i + 1}</span></TD>
                          <ProductCell id={r.product_id} name={r.product_name} />
                          <TD><span className="text-white/50 text-sm">{r.category || '—'}</span></TD>
                          <TD right className="font-mono tabular-nums text-amber-400 font-bold">{fmt(r.consumed_90d)}</TD>
                          <TD right className="font-mono tabular-nums text-orange-300">{fmt(monthlyAvg, 1)}</TD>
                          <TD right className="font-mono tabular-nums text-white">{fmt(r.qoh)}</TD>
                          <TD right className="font-mono tabular-nums text-emerald-400">{fmt(r.available)}</TD>
                          <TD right><MoHBadge v={moh} /></TD>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

        </div>
      )}
    </div>
  )
}
