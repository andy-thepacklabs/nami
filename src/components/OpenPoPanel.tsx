'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, ShoppingCart, AlertTriangle } from 'lucide-react'

interface PoLine {
  orderId: string
  orderNumber: string
  supplier: string
  orderDate: string
  expectedDate: string
  productId: string
  productName: string
  category: string
  qtyOrdered: number
  qtyReceived: number
  qtyBackordered: number
  unitCost: number
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtDate(s: string) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(expectedDate: string) {
  if (!expectedDate) return false
  return new Date(expectedDate) < new Date()
}

export default function OpenPoPanel() {
  const [lines, setLines] = useState<PoLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)

  const [debug, setDebug] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    setDebug(null)
    try {
      const res = await fetch('/api/open-po')
      const data = await res.json()
      setLines(data.lines ?? [])
      if (data.error) setError(data.error)
      if (data.debug) setDebug(JSON.stringify(data.debug))
      setLoaded(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = lines.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.orderNumber.toLowerCase().includes(q) ||
      l.supplier.toLowerCase().includes(q) ||
      l.productId.toLowerCase().includes(q) ||
      l.productName.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q)
  })

  // Group by order number
  const grouped = new Map<string, PoLine[]>()
  filtered.forEach(l => {
    if (!grouped.has(l.orderNumber)) grouped.set(l.orderNumber, [])
    grouped.get(l.orderNumber)!.push(l)
  })

  const totalBackordered = lines.reduce((s, l) => s + l.qtyBackordered, 0)
  const totalValue = lines.reduce((s, l) => s + l.qtyBackordered * l.unitCost, 0)
  const overdueOrders = new Set(lines.filter(l => isOverdue(l.expectedDate)).map(l => l.orderNumber)).size

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">Open PO Report</h2>
          <p className="text-white/40 text-xs mt-0.5">
            Backordered purchases · Raw Materials & Marketing only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search PO, supplier, SKU…"
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 w-52"
          />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {loaded && !loading && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Open POs</div>
            <div className="text-white font-bold text-xl">{grouped.size}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Backordered Units</div>
            <div className="text-orange-400 font-bold text-xl">{fmt(totalBackordered)}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Overdue POs</div>
            <div className="text-red-400 font-bold text-xl">{overdueOrders}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Incoming Value</div>
            <div className="text-green-400 font-bold text-xl">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 text-red-400 text-xs">{error}</div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-white/10">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Fetching from Finale…
          </div>
        ) : !loaded ? (
          <div className="flex flex-col items-center justify-center h-48 text-white/20 gap-2">
            <ShoppingCart className="w-8 h-8" />
            <span className="text-xs">Click Refresh to load POs</span>
          </div>
        ) : grouped.size === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">No backordered POs found</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0d0d0d] z-10">
              <tr>
                <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">PO #</th>
                <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Supplier</th>
                <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Product</th>
                <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Category</th>
                <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Ordered</th>
                <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Received</th>
                <th className="text-right text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Backordered</th>
                <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Order Date</th>
                <th className="text-left text-white/40 uppercase tracking-widest px-4 py-2.5 border-b border-white/10 font-medium">Expected</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([orderNum, orderLines]) => {
                const first = orderLines[0]
                const overdue = isOverdue(first.expectedDate)
                return orderLines.map((l, i) => (
                  <tr key={`${l.orderId}-${l.productId}`} className="border-b border-white/5 hover:bg-white/[0.03]">
                    {i === 0 && (
                      <>
                        <td rowSpan={orderLines.length} className="px-4 py-2 align-top border-r border-white/5">
                          <span className="font-mono text-sky-400 font-semibold">{orderNum}</span>
                        </td>
                        <td rowSpan={orderLines.length} className="px-4 py-2 align-top text-white/60 border-r border-white/5">
                          {first.supplier}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2">
                      <div className="font-mono text-white/80">{l.productId}</div>
                      <div className="text-white/40 mt-0.5 truncate max-w-xs">{l.productName}</div>
                    </td>
                    <td className="px-4 py-2 text-white/40">{l.category}</td>
                    <td className="px-4 py-2 text-right text-white/60">{fmt(l.qtyOrdered)}</td>
                    <td className="px-4 py-2 text-right text-white/60">{fmt(l.qtyReceived)}</td>
                    <td className="px-4 py-2 text-right font-bold text-orange-400">{fmt(l.qtyBackordered)}</td>
                    {i === 0 && (
                      <>
                        <td rowSpan={orderLines.length} className="px-4 py-2 align-top text-white/40 border-l border-white/5">
                          {fmtDate(first.orderDate)}
                        </td>
                        <td rowSpan={orderLines.length} className="px-4 py-2 align-top border-l border-white/5">
                          <span className={overdue ? 'text-red-400 font-semibold flex items-center gap-1' : 'text-white/40'}>
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            {fmtDate(first.expectedDate)}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
