'use client'

import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Zap, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpendingRow {
  month_key?: string
  order_date: string
  order_status: string
  vendor: string
  order_id: string
  product_id: string
  product_name: string
  qty_ordered: number
  unit_cost: number
  line_total: number
}

function fmt$(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtN(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtDate(s: string) {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtMonth(ym: string) {
  if (!ym) return ym
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function statusBadge(status: string) {
  const s = (status ?? '').toLowerCase()
  const color =
    s === 'received'   ? 'text-green-400 bg-green-900/30' :
    s === 'ordered'    ? 'text-blue-400 bg-blue-900/30' :
    s === 'committed'  ? 'text-orange-400 bg-orange-900/30' :
    s === 'partial'    ? 'text-yellow-400 bg-yellow-900/30' :
    s === 'cancelled'  ? 'text-red-400 bg-red-900/30' :
    'text-white/40 bg-white/5'
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', color)}>
      {status || '—'}
    </span>
  )
}

const COLS = ['Order Date', 'Status', 'Supplier', 'Order ID', 'Product ID', 'Description', 'Qty Ordered', 'Unit Price', 'Subtotal']

function TableHeader() {
  return (
    <thead className="sticky top-0 z-10 bg-[#0d0a07]">
      <tr className="border-b border-orange-900/40">
        {COLS.map(c => (
          <th key={c} className={cn(
            'px-4 py-3 text-xs font-bold uppercase tracking-widest text-orange-700 whitespace-nowrap',
            ['Qty Ordered', 'Unit Price', 'Subtotal'].includes(c) ? 'text-right' : 'text-left'
          )}>{c}</th>
        ))}
      </tr>
    </thead>
  )
}

function SpendingRow({ row }: { row: SpendingRow }) {
  return (
    <tr className="border-b border-orange-900/10 hover:bg-orange-950/20 transition-colors">
      <td className="px-4 py-2.5 text-xs text-white/60 whitespace-nowrap">{fmtDate(row.order_date)}</td>
      <td className="px-4 py-2.5">{statusBadge(row.order_status)}</td>
      <td className="px-4 py-2.5 text-xs text-white/70 font-medium">{row.vendor}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-orange-300/70">{row.order_id}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-orange-300/70">{row.product_id}</td>
      <td className="px-4 py-2.5 text-xs text-white/60 max-w-xs truncate" title={row.product_name}>{row.product_name}</td>
      <td className="px-4 py-2.5 text-xs text-white/60 text-right tabular-nums">{fmtN(row.qty_ordered)}</td>
      <td className="px-4 py-2.5 text-xs text-white/60 text-right tabular-nums">{fmt$(row.unit_cost)}</td>
      <td className="px-4 py-2.5 text-xs font-bold text-green-400 text-right tabular-nums">{fmt$(row.line_total)}</td>
    </tr>
  )
}

export default function SpendingPanel() {
  const [subTab, setSubTab] = useState<'thismonth' | 'bymonth'>('thismonth')

  const [tmRows, setTmRows]   = useState<SpendingRow[]>([])
  const [tmMeta, setTmMeta]   = useState<{ last_import: string | null; total: number } | null>(null)
  const [tmLoaded, setTmLoaded] = useState(false)

  const [bmRows, setBmRows]   = useState<SpendingRow[]>([])
  const [bmMeta, setBmMeta]   = useState<{ last_import: string | null; total: number } | null>(null)
  const [bmLoaded, setBmLoaded] = useState(false)

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    if (subTab === 'thismonth' && !tmLoaded) {
      fetch('/api/spending')
        .then(r => r.json())
        .then(d => { setTmRows(d.rows ?? []); setTmMeta(d.meta); setTmLoaded(true) })
    }
    if (subTab === 'bymonth' && !bmLoaded) {
      fetch('/api/spending?mode=bymonth')
        .then(r => r.json())
        .then(d => { setBmRows(d.rows ?? []); setBmMeta(d.meta); setBmLoaded(true) })
    }
  }, [subTab, tmLoaded, bmLoaded])

  // Group by-month rows by month_key
  const byMonthGroups = useMemo(() => {
    const months = [...new Set(bmRows.map(r => r.month_key ?? ''))].filter(Boolean).sort((a, b) => b.localeCompare(a))
    return months.map(mk => ({
      month_key: mk,
      rows: bmRows.filter(r => r.month_key === mk),
      total: bmRows.filter(r => r.month_key === mk).reduce((s, r) => s + r.line_total, 0),
    }))
  }, [bmRows])

  const tmTotal = useMemo(() => tmRows.reduce((s, r) => s + r.line_total, 0), [tmRows])

  async function handleSync(months?: string[]) {
    setSyncing(true)
    setSyncMsg(months ? 'Starting Jan–Jun 2026 sync…' : 'Syncing this month…')
    try {
      await fetch('/api/spending-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(months ? { months } : {}),
      })
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const s = await fetch('/api/spending-sync').then(r => r.json())
        setSyncMsg(s.progress || s.status)
        if (s.status === 'done' || s.status === 'error') {
          if (s.status === 'error') { setSyncMsg(`Error: ${s.error}`); break }
          setSyncMsg(`Done — ${s.count} line items synced`)
          setTmLoaded(false); setBmLoaded(false)
          break
        }
      }
    } catch (e) {
      setSyncMsg(`Error: ${e}`)
    } finally {
      setSyncing(false)
    }
  }

  const JAN_JUN = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
        {(['thismonth', 'bymonth'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={cn('px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
              subTab === t ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
            )}>
            {t === 'thismonth' ? 'This Month' : 'By Month'}
          </button>
        ))}
        <div className="flex-1" />
        {syncMsg && <span className="text-xs text-orange-400/70 max-w-md truncate" title={syncMsg}>{syncMsg}</span>}
        {subTab === 'thismonth' && (
          <button onClick={() => handleSync()} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30 hover:bg-orange-500/25 disabled:opacity-50 transition-colors">
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Sync from Finale
          </button>
        )}
        {subTab === 'bymonth' && (
          <button onClick={() => handleSync(JAN_JUN)} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30 hover:bg-orange-500/25 disabled:opacity-50 transition-colors">
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Sync Jan–Jun 2026
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">

        {subTab === 'thismonth' && (
          <>
            {/* Summary bar */}
            <div className="px-6 py-3 border-b border-orange-900/20 flex items-center gap-6 shrink-0">
              <span className="text-sm text-white/50">Total</span>
              <span className="text-xl font-black text-green-400">{fmt$(tmTotal)}</span>
              <span className="text-xs text-white/30">{tmRows.length} line items</span>
              {tmMeta?.last_import && (
                <span className="text-xs text-white/20 ml-auto">Last sync: {new Date(tmMeta.last_import).toLocaleString()}</span>
              )}
            </div>
            <table className="w-full text-sm">
              <TableHeader />
              <tbody>
                {tmRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-orange-900">
                    No data — click "Sync from Finale" to load this month's purchase orders.
                  </td></tr>
                ) : tmRows.map((row, i) => <SpendingRow key={i} row={row} />)}
              </tbody>
              {tmRows.length > 0 && (
                <tfoot className="sticky bottom-0 bg-[#0d0a07] border-t border-orange-900/40">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-widest">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-white/40">{fmtN(tmRows.reduce((s, r) => s + r.qty_ordered, 0))}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-sm font-black text-green-400">{fmt$(tmTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}

        {subTab === 'bymonth' && (
          <>
            {bmRows.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-orange-900">
                No data — click "Sync Jan–Jun 2026" to load purchase orders.
              </div>
            ) : byMonthGroups.map(({ month_key, rows, total }) => {
              const expanded = expandedMonths.has(month_key)
              const toggle = () => setExpandedMonths(prev => {
                const s = new Set(prev); s.has(month_key) ? s.delete(month_key) : s.add(month_key); return s
              })
              return (
                <div key={month_key} className="border-b border-orange-900/20">
                  {/* Month header row — always visible, click to expand */}
                  <div
                    onClick={toggle}
                    className="px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-orange-950/20 transition-colors"
                  >
                    {expanded
                      ? <ChevronDown className="w-4 h-4 text-orange-600 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-orange-600 shrink-0" />}
                    <span className="text-sm font-black text-white/80 uppercase tracking-wider">{fmtMonth(month_key)}</span>
                    <span className="text-xs text-white/30">{rows.length} items</span>
                    <span className="ml-auto text-sm font-black text-green-400">{fmt$(total)}</span>
                  </div>
                  {/* Expanded table */}
                  {expanded && (
                    <table className="w-full text-sm">
                      <TableHeader />
                      <tbody>
                        {rows.map((row, i) => <SpendingRow key={i} row={row} />)}
                      </tbody>
                      <tfoot className="border-t border-orange-900/20 bg-orange-950/10">
                        <tr>
                          <td colSpan={6} className="px-4 py-2.5 text-xs font-bold text-white/30 uppercase tracking-widest">
                            {fmtMonth(month_key)} Total
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-white/30">
                            {fmtN(rows.reduce((s, r) => s + r.qty_ordered, 0))}
                          </td>
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5 text-right text-sm font-black text-green-400">{fmt$(total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )
            })}
            {bmMeta?.last_import && (
              <div className="px-6 py-3 text-xs text-white/20">
                Last sync: {new Date(bmMeta.last_import).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
