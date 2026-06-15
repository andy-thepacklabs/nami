'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Package } from 'lucide-react'

interface RestockRow {
  product_id: string
  product_name: string | null
  qoh: number
  sales_60d: number | null
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

export default function EcomRestockPanel() {
  const [rows, setRows] = useState<RestockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ecom-restock')
      const data = await res.json()
      setRows(data.rows ?? [])
      if (data.error) setError(data.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Derived columns
  const tableRows = rows.map(r => {
    const daily = (r.sales_60d ?? 0) / 60
    const restockPoint = Math.ceil(daily * 14)
    const qtyToRestock = Math.max(0, restockPoint - r.qoh)
    return { ...r, restockPoint, qtyToRestock }
  })

  const needsRestock = tableRows.filter(r => r.qtyToRestock > 0)
  const ok = tableRows.filter(r => r.qtyToRestock === 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">Ecom Single Restock</h2>
          <p className="text-white/40 text-xs mt-0.5">-01 SKUs · Restock Point = 2-week supply based on last 60D sales</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-xs bg-red-900/20 border border-red-900/30 rounded px-3 py-2">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#1a1f2e] border-b border-white/10 text-white/50 text-left">
                <th className="px-3 py-2.5 font-medium">Product ID</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium text-right">Stock QoH</th>
                <th className="px-3 py-2.5 font-medium text-right">Last 60D Sale</th>
                <th className="px-3 py-2.5 font-medium text-right">Restock Point (2wk)</th>
                <th className="px-3 py-2.5 font-medium text-right">Qty to Restock</th>
              </tr>
            </thead>
            <tbody>
              {needsRestock.length > 0 && (
                <>
                  <tr className="bg-red-950/30">
                    <td colSpan={6} className="px-3 py-1.5 text-red-400/70 text-[10px] font-semibold uppercase tracking-wider">
                      Needs Restock ({needsRestock.length})
                    </td>
                  </tr>
                  {needsRestock.map(r => (
                    <tr key={r.product_id} className="border-b border-white/5 hover:bg-white/5 bg-red-950/10">
                      <td className="px-3 py-2 font-mono text-white/90">{r.product_id}</td>
                      <td className="px-3 py-2 text-white/60 max-w-[240px] truncate">{r.product_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-white/80">{fmt(r.qoh)}</td>
                      <td className="px-3 py-2 text-right text-white/80">{r.sales_60d != null ? fmt(r.sales_60d) : '—'}</td>
                      <td className="px-3 py-2 text-right text-white/80">{fmt(r.restockPoint)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-400">{fmt(r.qtyToRestock)}</td>
                    </tr>
                  ))}
                </>
              )}
              {ok.length > 0 && (
                <>
                  <tr className="bg-white/5">
                    <td colSpan={6} className="px-3 py-1.5 text-white/30 text-[10px] font-semibold uppercase tracking-wider">
                      OK — Sufficient Stock ({ok.length})
                    </td>
                  </tr>
                  {ok.map(r => (
                    <tr key={r.product_id} className="border-b border-white/5 hover:bg-white/5 opacity-60">
                      <td className="px-3 py-2 font-mono text-white/70">{r.product_id}</td>
                      <td className="px-3 py-2 text-white/50 max-w-[240px] truncate">{r.product_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-white/70">{fmt(r.qoh)}</td>
                      <td className="px-3 py-2 text-right text-white/70">{r.sales_60d != null ? fmt(r.sales_60d) : '—'}</td>
                      <td className="px-3 py-2 text-right text-white/70">{fmt(r.restockPoint)}</td>
                      <td className="px-3 py-2 text-right text-green-500/80">✓</td>
                    </tr>
                  ))}
                </>
              )}
              {tableRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-white/30">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No data — run a Finale sync first
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
