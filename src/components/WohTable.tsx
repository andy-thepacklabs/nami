'use client'

import { useState, useMemo } from 'react'
import { RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

interface WohRow {
  product_id: string
  product_name: string | null
  qoh: number
  available: number
  consumed_90d: number | null
  sales_90d?: number | null
}

type SortKey = 'product_id' | 'qoh' | 'available' | 'sales_90d' | 'consumed_90d' | 'monthly_required' | 'moh_qoh' | 'moh_avail'

function SortTH({ label, col, active, dir, onSort, right }: {
  label: string; col: SortKey; active: SortKey | null; dir: 'asc' | 'desc'; onSort: (c: SortKey) => void; right?: boolean
}) {
  const isActive = active === col
  return (
    <th
      className={`px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] cursor-pointer select-none whitespace-nowrap group ${right ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1.5 ${right ? 'flex-row-reverse' : ''} ${isActive ? 'text-orange-400' : 'text-white/50 hover:text-white/80'} transition-colors`}>
        {label}
        {isActive
          ? dir === 'asc' ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
          : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-30 group-hover:opacity-60" />
        }
      </span>
    </th>
  )
}

interface WohTableProps {
  rows: WohRow[]
  loading: boolean
  search: string
  emptyMessage?: string
  showSale?: boolean
  useSaleForMonthly?: boolean
}

export default function WohTable({ rows, loading, search, emptyMessage = 'No data found.', showSale = false, useSaleForMonthly = false }: WohTableProps) {
  const [sortCol, setSortCol] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (col: SortKey) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'product_id' ? 'asc' : 'desc')
    }
  }

  const processed = useMemo(() => {
    const filtered = search
      ? rows.filter(r =>
          r.product_id.toLowerCase().includes(search.toLowerCase()) ||
          (r.product_name || '').toLowerCase().includes(search.toLowerCase())
        )
      : rows

    return filtered.map(r => {
      const base = useSaleForMonthly ? (r.sales_90d ?? null) : (r.consumed_90d ?? null)
      const monthly_required = base != null && base > 0 ? base / 3 : null
      const moh_qoh = monthly_required != null && r.qoh > 0 ? r.qoh / monthly_required : null
      const moh_avail = monthly_required != null && r.available > 0 ? r.available / monthly_required : null
      return { ...r, monthly_required, moh_qoh, moh_avail }
    })
  }, [rows, search, useSaleForMonthly])

  const sorted = useMemo(() => {
    if (!sortCol) return processed
    return [...processed].sort((a, b) => {
      let av: string | number | null = null
      let bv: string | number | null = null
      if (sortCol === 'product_id') { av = a.product_id; bv = b.product_id }
      else if (sortCol === 'qoh') { av = a.qoh; bv = b.qoh }
      else if (sortCol === 'available') { av = a.available; bv = b.available }
      else if (sortCol === 'sales_90d') { av = a.sales_90d ?? -1; bv = b.sales_90d ?? -1 }
      else if (sortCol === 'consumed_90d') { av = a.consumed_90d ?? -1; bv = b.consumed_90d ?? -1 }
      else if (sortCol === 'monthly_required') { av = a.monthly_required ?? -1; bv = b.monthly_required ?? -1 }
      else if (sortCol === 'moh_qoh') { av = a.moh_qoh ?? -1; bv = b.moh_qoh ?? -1 }
      else if (sortCol === 'moh_avail') { av = a.moh_avail ?? -1; bv = b.moh_avail ?? -1 }

      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = av as number ?? 0
      const bn = bv as number ?? 0
      return sortDir === 'asc' ? an - bn : bn - an
    })
  }, [processed, sortCol, sortDir])

  if (loading) return (
    <div className="flex items-center justify-center h-32 gap-2 text-white/30 text-xs">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
    </div>
  )

  if (sorted.length === 0) return (
    <div className="flex items-center justify-center h-32 text-xs text-white/20">{emptyMessage}</div>
  )

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-black z-10">
        <tr className="border-b border-white/10">
          <SortTH label="Product ID"       col="product_id"       active={sortCol} dir={sortDir} onSort={handleSort} />
          <SortTH label="Stock QoH"        col="qoh"              active={sortCol} dir={sortDir} onSort={handleSort} right />
          <SortTH label="Stock Available"  col="available"        active={sortCol} dir={sortDir} onSort={handleSort} right />
          {showSale && <SortTH label="Sale 90d" col="sales_90d"   active={sortCol} dir={sortDir} onSort={handleSort} right />}
          <SortTH label="Consumed 90d"     col="consumed_90d"     active={sortCol} dir={sortDir} onSort={handleSort} right />
          <SortTH label="Monthly Required" col="monthly_required" active={sortCol} dir={sortDir} onSort={handleSort} right />
          <SortTH label="Mo On Hand (QoH)" col="moh_qoh"          active={sortCol} dir={sortDir} onSort={handleSort} right />
          <SortTH label="Mo On Hand (Avail)" col="moh_avail"      active={sortCol} dir={sortDir} onSort={handleSort} right />
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {sorted.map(row => {
          const mohColor = (v: number | null) => v == null ? 'text-white/30' : v < 1 ? 'text-red-400' : v < 2 ? 'text-amber-400' : 'text-sky-400'
          return (
            <tr key={row.product_id} className="hover:bg-white/5 transition-colors">
              <td className="px-4 py-2.5">
                <div className="font-mono font-semibold text-orange-300 text-base">{row.product_id}</div>
                {row.product_name && <div className="text-sm text-white/50">{row.product_name}</div>}
              </td>
              <td className="px-4 py-2.5 text-right text-base font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right text-base font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
              {showSale && (
                <td className="px-4 py-2.5 text-right text-base font-mono tabular-nums text-sky-400">
                  {row.sales_90d != null ? Math.round(row.sales_90d).toLocaleString() : '—'}
                </td>
              )}
              <td className="px-4 py-2.5 text-right text-base font-mono tabular-nums text-amber-400">
                {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-base font-mono tabular-nums text-orange-300">
                {row.monthly_required != null ? Math.round(row.monthly_required).toLocaleString() : '—'}
              </td>
              <td className={`px-4 py-2.5 text-right text-base font-mono tabular-nums font-bold ${mohColor(row.moh_qoh)}`}>
                {row.moh_qoh != null ? row.moh_qoh.toFixed(1) : '—'}
              </td>
              <td className={`px-4 py-2.5 text-right text-base font-mono tabular-nums font-bold ${mohColor(row.moh_avail)}`}>
                {row.moh_avail != null ? row.moh_avail.toFixed(1) : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
