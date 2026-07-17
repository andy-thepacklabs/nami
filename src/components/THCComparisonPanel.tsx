'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, Zap, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RevenueRow  { month_key?: string; compound: string; orders: number; qty: number; revenue: number }
interface ProductRow  { month_key?: string; compound: string; product_id: string; product_name: string; orders: number; qty: number; revenue: number }
interface StateRow    { month_key?: string; state: string; compound: string; qty: number; revenue: number }

function fmt$(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtN(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtMonth(ym: string) {
  if (!ym) return ym
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}
function pct(a: number, total: number) {
  return total === 0 ? 0 : Math.round((a / total) * 100)
}

const COMPOUNDS: Record<string, { text: string; bar: string; label: string }> = {
  'THCA':                  { text: 'text-blue-400',    bar: 'bg-blue-500',    label: 'THCA' },
  'THCP':                  { text: 'text-purple-400',  bar: 'bg-purple-500',  label: 'THCP' },
  'Functional Euphoria':   { text: 'text-pink-400',    bar: 'bg-pink-500',    label: 'Functional Euphoria' },
  'Functional Microdose':  { text: 'text-amber-400',   bar: 'bg-amber-500',   label: 'Functional Microdose' },
  'Froot Jam':             { text: 'text-green-400',   bar: 'bg-green-500',   label: 'Froot Jam' },
  'Cereal Crunchies':      { text: 'text-cyan-400',    bar: 'bg-cyan-500',    label: 'Cereal Crunchies' },
}
const THCA = COMPOUNDS['THCA']
const THCP = COMPOUNDS['THCP']

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-orange-500">{title}</h3>
      {sub && <span className="text-xs text-white/25">{sub}</span>}
    </div>
  )
}

// ─── Split bar ────────────────────────────────────────────────────────────────
function SplitBar({ thcaVal, thcpVal }: { thcaVal: number; thcpVal: number }) {
  const total = thcaVal + thcpVal
  const ap = pct(thcaVal, total)
  const bp = pct(thcpVal, total)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-white/30">
        <span className="text-blue-400/70">THCA {ap}%</span>
        <span className="text-purple-400/70">THCP {bp}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
        <div className={cn('h-full transition-all', THCA.bar + '/60')} style={{ width: `${ap}%` }} />
        <div className={cn('h-full transition-all', THCP.bar + '/60')} style={{ width: `${bp}%` }} />
      </div>
    </div>
  )
}

// ─── Main snapshot for one time period ────────────────────────────────────────
function Snapshot({
  revenue, byProduct, byState,
}: {
  revenue:   RevenueRow[]
  byProduct: ProductRow[]
  byState:   StateRow[]
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const compoundKeys = [...new Set(revenue.map(r => r.compound))].filter(k => COMPOUNDS[k])
  const revByCompound = compoundKeys.map(k => ({ key: k, c: COMPOUNDS[k], row: revenue.find(r => r.compound === k), rev: revenue.find(r => r.compound === k)?.revenue ?? 0 }))
  const total = revByCompound.reduce((s, r) => s + r.rev, 0)

  const prodsByCompound = compoundKeys.map(k => ({ key: k, c: COMPOUNDS[k], prods: byProduct.filter(r => r.compound === k) }))

  // States: pivot so each state has per-compound values
  const stateMap = new Map<string, Record<string, number>>()
  for (const r of byState) {
    if (!stateMap.has(r.state)) stateMap.set(r.state, {})
    const entry = stateMap.get(r.state)!
    entry[r.compound] = (entry[r.compound] ?? 0) + r.revenue
  }
  const states = [...stateMap.entries()]
    .map(([state, v]) => ({ state, ...v, total: Object.values(v).reduce((s, n) => s + n, 0) }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-8">

      {/* ── 1. Revenue Summary (clickable cards) ──────────────────────────── */}
      <section>
        <SectionHeader title="Ship Sale Revenue" sub={`${fmt$(total)} total — click a card to drill down`} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {revByCompound.map(({ key, c, row, rev }) => {
            const isOpen = expanded === key
            const prods = byProduct.filter(r => r.compound === key)
            const lineStates = byState.filter(r => r.compound === key).sort((a, b) => b.revenue - a.revenue)
            return (
              <div key={c.label} className="col-span-1">
                <div
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className={cn(
                    'rounded-xl border p-5 cursor-pointer transition-all',
                    isOpen
                      ? 'border-orange-500/40 bg-[#151008] ring-1 ring-orange-500/20'
                      : 'border-orange-900/20 bg-[#0d0a07] hover:border-orange-900/40'
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn('text-xs font-black tracking-widest uppercase', c.text)}>{c.label}</div>
                    {isOpen
                      ? <ChevronDown className={cn('w-4 h-4', c.text)} />
                      : <ChevronRight className={cn('w-4 h-4 text-white/20')} />}
                  </div>
                  <div className={cn('text-3xl font-black tabular-nums mb-1', c.text)}>{fmt$(rev)}</div>
                  <div className="text-[10px] text-white/30 space-y-0.5">
                    <div>{fmtN(row?.qty ?? 0)} units shipped</div>
                    <div>{fmtN(row?.orders ?? 0)} orders</div>
                    <div className={cn('text-sm font-bold', c.text)}>{pct(rev, total)}% of revenue</div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-2 rounded-xl border border-orange-900/20 bg-[#0d0a07] overflow-hidden">
                    {/* Products table */}
                    <div className={cn('px-4 py-2.5 border-b border-orange-900/20 text-xs font-black uppercase tracking-widest', c.text)}>
                      Products — {prods.length} SKUs
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-orange-900/10">
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Product</th>
                          <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Qty</th>
                          <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prods.length === 0 ? (
                          <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-white/20">No data</td></tr>
                        ) : prods.map(p => (
                          <tr key={p.product_id} className="border-b border-orange-900/10 hover:bg-white/3 transition-colors">
                            <td className="px-4 py-2">
                              <div className={cn('font-mono text-[10px]', c.text + '/70')}>{p.product_id}</div>
                              <div className="text-[10px] text-white/40 leading-tight max-w-[180px] truncate" title={p.product_name}>{p.product_name}</div>
                            </td>
                            <td className="px-3 py-2 text-right text-[10px] text-white/40 tabular-nums">{fmtN(p.qty)}</td>
                            <td className={cn('px-4 py-2 text-right text-xs font-bold tabular-nums', c.text)}>{fmt$(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                      {prods.length > 0 && (
                        <tfoot className="border-t border-orange-900/20">
                          <tr>
                            <td className="px-4 py-2 text-[10px] text-white/25 uppercase tracking-widest">Total</td>
                            <td className="px-3 py-2 text-right text-[10px] text-white/30 tabular-nums">
                              {fmtN(prods.reduce((s, r) => s + r.qty, 0))}
                            </td>
                            <td className={cn('px-4 py-2 text-right text-sm font-black tabular-nums', c.text)}>
                              {fmt$(prods.reduce((s, r) => s + r.revenue, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>

                    {/* State breakdown */}
                    <div className={cn('px-4 py-2.5 border-t border-b border-orange-900/20 text-xs font-black uppercase tracking-widest', c.text)}>
                      By State — {lineStates.length} states
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-orange-900/10">
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">State</th>
                          <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Qty</th>
                          <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Revenue</th>
                          <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-white/20" style={{ minWidth: 80 }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineStates.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-white/20">No data</td></tr>
                        ) : lineStates.map(s => {
                          const lineTotal = lineStates.reduce((sum, r) => sum + r.revenue, 0)
                          return (
                            <tr key={s.state} className="border-b border-orange-900/10 hover:bg-white/3 transition-colors">
                              <td className="px-4 py-2 text-sm font-semibold text-white/70">{s.state}</td>
                              <td className="px-3 py-2 text-right text-[10px] text-white/40 tabular-nums">{fmtN(s.qty)}</td>
                              <td className={cn('px-4 py-2 text-right text-xs font-bold tabular-nums', c.text)}>{fmt$(s.revenue)}</td>
                              <td className="px-4 py-2" style={{ minWidth: 80 }}>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full', c.bar + '/60')} style={{ width: `${pct(s.revenue, lineTotal)}%` }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {lineStates.length > 0 && (
                        <tfoot className="border-t border-orange-900/20">
                          <tr>
                            <td className="px-4 py-2 text-[10px] text-white/25 uppercase tracking-widest">Total</td>
                            <td className="px-3 py-2 text-right text-[10px] text-white/30 tabular-nums">
                              {fmtN(lineStates.reduce((s, r) => s + r.qty, 0))}
                            </td>
                            <td className={cn('px-4 py-2 text-right text-sm font-black tabular-nums', c.text)}>
                              {fmt$(lineStates.reduce((s, r) => s + r.revenue, 0))}
                            </td>
                            <td className="px-4 py-2" />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-white/30 flex-wrap gap-x-4">
            {revByCompound.map(({ c, rev }) => (
              <span key={c.label} className={c.text + '/70'}>{c.label} {pct(rev, total)}%</span>
            ))}
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
            {revByCompound.map(({ c, rev }) => (
              <div key={c.label} className={cn('h-full transition-all', c.bar + '/60')} style={{ width: `${pct(rev, total)}%` }} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. By Product ──────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Ship Sale by Product" sub="top 10 per line" />
        <div className="grid grid-cols-2 gap-4">
          {prodsByCompound.map(({ c, prods }) => (
            <div key={c.label} className="rounded-xl border border-orange-900/20 bg-[#0d0a07] overflow-hidden">
              <div className={cn('px-4 py-2.5 border-b border-orange-900/20 text-xs font-black uppercase tracking-widest', c.text)}>
                {c.label} — {prods.length} SKUs
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-orange-900/10">
                    <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Product</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Qty</th>
                    <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {prods.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-white/20">No data</td></tr>
                  ) : prods.slice(0, 10).map(p => (
                    <tr key={p.product_id} className="border-b border-orange-900/10 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-2">
                        <div className={cn('font-mono text-[10px]', c.text + '/70')}>{p.product_id}</div>
                        <div className="text-[10px] text-white/40 leading-tight max-w-[180px] truncate" title={p.product_name}>{p.product_name}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] text-white/40 tabular-nums">{fmtN(p.qty)}</td>
                      <td className={cn('px-4 py-2 text-right text-xs font-bold tabular-nums', c.text)}>{fmt$(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                {prods.length > 0 && (
                  <tfoot className="border-t border-orange-900/20">
                    <tr>
                      <td className="px-4 py-2 text-[10px] text-white/25 uppercase tracking-widest">Total</td>
                      <td className="px-3 py-2 text-right text-[10px] text-white/30 tabular-nums">
                        {fmtN(prods.reduce((s, r) => s + r.qty, 0))}
                      </td>
                      <td className={cn('px-4 py-2 text-right text-sm font-black tabular-nums', c.text)}>
                        {fmt$(prods.reduce((s, r) => s + r.revenue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. By State ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Ship Sale by State" sub={`${states.length} states`} />
        <div className="rounded-xl border border-orange-900/20 bg-[#0d0a07] overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-orange-900/30">
              <tr>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">State</th>
                {compoundKeys.map(k => (
                  <th key={k} className={cn('px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest', COMPOUNDS[k].text + '/60')}>{COMPOUNDS[k].label}</th>
                ))}
                <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-white/30">Total</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/20" style={{ minWidth: 120 }}>Split</th>
              </tr>
            </thead>
            <tbody>
              {states.length === 0 ? (
                <tr><td colSpan={compoundKeys.length + 3} className="px-5 py-10 text-center text-xs text-white/20">No data</td></tr>
              ) : states.map(s => (
                <tr key={s.state} className="border-b border-orange-900/10 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-2.5 text-sm font-semibold text-white/70">{s.state}</td>
                  {compoundKeys.map(k => (
                    <td key={k} className={cn('px-4 py-2.5 text-right text-sm font-bold tabular-nums', COMPOUNDS[k].text)}>{fmt$((s as Record<string, number>)[k] ?? 0)}</td>
                  ))}
                  <td className="px-5 py-2.5 text-right text-xs text-white/40 tabular-nums">{fmt$(s.total)}</td>
                  <td className="px-5 py-2.5" style={{ minWidth: 120 }}>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                      {compoundKeys.map(k => (
                        <div key={k} className={cn('h-full', COMPOUNDS[k].bar + '/60')} style={{ width: `${pct((s as Record<string, number>)[k] ?? 0, s.total)}%` }} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {states.length > 0 && (
              <tfoot className="border-t border-orange-900/30">
                <tr>
                  <td className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/25">Total</td>
                  {compoundKeys.map(k => (
                    <td key={k} className={cn('px-4 py-3 text-right text-sm font-black tabular-nums', COMPOUNDS[k].text)}>
                      {fmt$(states.reduce((sum, r) => sum + ((r as Record<string, number>)[k] ?? 0), 0))}
                    </td>
                  ))}
                  <td className="px-5 py-3 text-right text-sm font-black text-white/40 tabular-nums">
                    {fmt$(states.reduce((s, r) => s + r.total, 0))}
                  </td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

    </div>
  )
}

// ─── Root panel ───────────────────────────────────────────────────────────────
export default function THCComparisonPanel() {
  const [subTab, setSubTab] = useState<'today' | 'thismonth' | 'bymonth'>('today')

  const [tdRevenue,   setTdRevenue]   = useState<RevenueRow[]>([])
  const [tdProducts,  setTdProducts]  = useState<ProductRow[]>([])
  const [tdStates,    setTdStates]    = useState<StateRow[]>([])
  const [tdLoaded,    setTdLoaded]    = useState(false)

  const [tmRevenue,   setTmRevenue]   = useState<RevenueRow[]>([])
  const [tmProducts,  setTmProducts]  = useState<ProductRow[]>([])
  const [tmStates,    setTmStates]    = useState<StateRow[]>([])
  const [tmLoaded,    setTmLoaded]    = useState(false)

  const [bmRevenue,   setBmRevenue]   = useState<RevenueRow[]>([])
  const [bmProducts,  setBmProducts]  = useState<ProductRow[]>([])
  const [bmStates,    setBmStates]    = useState<StateRow[]>([])
  const [bmLoaded,    setBmLoaded]    = useState(false)

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function handleSync(historical: boolean) {
    setSyncing(true); setSyncMsg(historical ? 'Starting…' : 'Syncing this month…')
    try {
      await fetch('/api/shipped-sales-by-product-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historical }),
      })
      const poll = async () => {
        const p = await fetch('/api/shipped-sales-by-product-sync').then(r => r.json())
        if (p.status === 'done') {
          setSyncMsg('Done!'); setSyncing(false)
          setTdLoaded(false); setTmLoaded(false); setBmLoaded(false)
        } else if (p.status === 'error') {
          setSyncMsg(p.error ?? 'Sync failed'); setSyncing(false)
        } else {
          setSyncMsg(p.progress ?? 'Syncing…')
          setTimeout(poll, 2000)
        }
      }
      setTimeout(poll, 2000)
    } catch (e) { setSyncMsg(String(e)); setSyncing(false) }
  }

  useEffect(() => {
    if (subTab === 'today' && !tdLoaded) {
      fetch('/api/thc-comparison?mode=today')
        .then(r => r.json())
        .then(d => { setTdRevenue(d.revenue ?? []); setTdProducts(d.byProduct ?? []); setTdStates(d.byState ?? []); setTdLoaded(true) })
    }
    if (subTab === 'thismonth' && !tmLoaded) {
      fetch('/api/thc-comparison')
        .then(r => r.json())
        .then(d => { setTmRevenue(d.revenue ?? []); setTmProducts(d.byProduct ?? []); setTmStates(d.byState ?? []); setTmLoaded(true) })
    }
    if (subTab === 'bymonth' && !bmLoaded) {
      fetch('/api/thc-comparison?mode=bymonth')
        .then(r => r.json())
        .then(d => { setBmRevenue(d.revenue ?? []); setBmProducts(d.byProduct ?? []); setBmStates(d.byState ?? []); setBmLoaded(true) })
    }
  }, [subTab, tdLoaded, tmLoaded, bmLoaded])

  const months = useMemo(() =>
    [...new Set(bmRevenue.map(r => r.month_key ?? ''))].filter(Boolean).sort((a, b) => b.localeCompare(a)),
    [bmRevenue]
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
        {(['today', 'thismonth', 'bymonth'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={cn('px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
              subTab === t
                ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30'
                : 'text-white/50 hover:bg-white/5 hover:text-white'
            )}>
            {t === 'today' ? 'Today' : t === 'thismonth' ? 'This Month' : 'By Month'}
          </button>
        ))}
        <div className="flex-1" />
        {syncMsg && !syncing && <span className="text-xs text-emerald-400">{syncMsg}</span>}
        <button onClick={() => handleSync(false)} disabled={syncing}
          className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-colors disabled:opacity-50 flex items-center gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
          {syncing ? (syncMsg ?? 'Syncing…') : 'Sync This Month'}
        </button>
        <button onClick={() => handleSync(true)} disabled={syncing}
          className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-colors disabled:opacity-50 flex items-center gap-1.5">
          <Zap className={cn('w-3.5 h-3.5', syncing && 'animate-pulse')} />
          Sync Jan–Jun 2026
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">

        {/* ── Today ── */}
        {subTab === 'today' && (
          tdRevenue.length === 0 ? (
            <div className="text-center text-sm text-orange-900 py-16">
              No sales today — data comes from synced shipped sales.
            </div>
          ) : (
            <Snapshot revenue={tdRevenue} byProduct={tdProducts} byState={tdStates} />
          )
        )}

        {/* ── This Month ── */}
        {subTab === 'thismonth' && (
          tmRevenue.length === 0 ? (
            <div className="text-center text-sm text-orange-900 py-16">
              No data — sync Shipped Sales by Product first.
            </div>
          ) : (
            <Snapshot revenue={tmRevenue} byProduct={tmProducts} byState={tmStates} />
          )
        )}

        {/* ── By Month ── */}
        {subTab === 'bymonth' && (
          months.length === 0 ? (
            <div className="text-center text-sm text-orange-900 py-16">
              No data — sync Shipped Sales by Product (Jan–Jun 2026) first.
            </div>
          ) : (
            <div className="space-y-3">
              {months.map(mk => {
                const open = expandedMonths.has(mk)
                const mRev = bmRevenue.filter(r => r.month_key === mk)
                const mTotal = mRev.reduce((s, r) => s + r.revenue, 0)
                const mCompounds = [...new Set(mRev.map(r => r.compound))].filter(k => COMPOUNDS[k])

                return (
                  <div key={mk} className="rounded-xl border border-orange-900/30 bg-[#0d0a07] overflow-hidden">
                    <div
                      onClick={() => setExpandedMonths(prev => {
                        const s = new Set(prev); s.has(mk) ? s.delete(mk) : s.add(mk); return s
                      })}
                      className="px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-orange-950/20 transition-colors"
                    >
                      {open
                        ? <ChevronDown  className="w-4 h-4 text-orange-600 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-orange-600 shrink-0" />}
                      <span className="text-sm font-black uppercase tracking-wider text-white/80">{fmtMonth(mk)}</span>
                      <div className="flex items-center gap-4 ml-4 text-xs text-white/30 flex-wrap">
                        {mCompounds.map(k => (
                          <span key={k}>{COMPOUNDS[k].label} <span className={COMPOUNDS[k].text + '/80'}>{fmt$(mRev.find(r => r.compound === k)?.revenue ?? 0)}</span></span>
                        ))}
                      </div>
                      <span className="ml-auto text-sm font-black text-green-400">{fmt$(mTotal)}</span>
                    </div>
                    {open && (
                      <div className="px-6 pb-8 border-t border-orange-900/20 pt-6">
                        <Snapshot
                          revenue={bmRevenue.filter(r => r.month_key === mk)}
                          byProduct={bmProducts.filter(r => r.month_key === mk)}
                          byState={bmStates.filter(r => r.month_key === mk)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

      </div>
    </div>
  )
}
