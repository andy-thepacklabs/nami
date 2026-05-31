'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Search, MapPin, Package, CheckCircle2, AlertTriangle,
  ChevronRight, ClipboardCheck, Play, RefreshCw,
  Check, XCircle, Minus, Plus, ChevronLeft, Trash2,
  RotateCcw, Shield, ShieldCheck, ShieldAlert, BarChart2
} from 'lucide-react'
import { cn, fmtDelta } from '@/lib/utils'

interface BinInfo {
  bin_name: string
  trusted_products: number
  last_counted: string | null
  last_counted_by: string | null
  total_counts: number
}

interface ProgressData {
  totalBins: number
  countedBins: number
  totalTrusted: number
  recentCounts: { id: number; bin_name: string; counted_by: string; count_type: string; status: string; started_at: string; completed_at: string | null; line_count: number }[]
  racks: { rack: string; total_bins: number; counted_bins: number }[]
}

interface CountDetail {
  count: { id: number; bin_name: string; counted_by: string; count_type: string; status: string }
  lines: { id: number; product_id: string; product_name: string; quantity: number; notes: string | null }[]
  trusted: { product_id: string; quantity: number; established_at: string; verify_count: number }[]
  finaleStock: { product_id: string; product_name: string; net_qty: number }[]
}

type View = 'progress' | 'bins' | 'counting'

export default function CycleCountPanel({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('progress')
  const [activeCountId, setActiveCountId] = useState<number | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0a07] border border-orange-900/30 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-orange-900/30">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-orange-500" />
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Cycle Count</h2>
            <span className="text-[10px] text-orange-700 uppercase tracking-widest">Establish Truth</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('progress')} className={cn('btn-ghost text-xs', view === 'progress' && 'text-orange-400 bg-orange-500/10')}>
              <BarChart2 className="w-3.5 h-3.5" /> Progress
            </button>
            <button onClick={() => setView('bins')} className={cn('btn-ghost text-xs', view === 'bins' && 'text-orange-400 bg-orange-500/10')}>
              <MapPin className="w-3.5 h-3.5" /> Bins
            </button>
            <div className="w-px h-6 bg-orange-900/30 mx-1" />
            <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'progress' && <ProgressView onSelectBin={(bin) => { setView('bins') }} onOpenCount={(id) => { setActiveCountId(id); setView('counting') }} />}
          {view === 'bins' && <BinListView onStartCount={(id) => { setActiveCountId(id); setView('counting') }} />}
          {view === 'counting' && activeCountId && (
            <CountingView countId={activeCountId} onBack={() => { setActiveCountId(null); setView('progress') }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Progress Dashboard ──

function ProgressView({ onSelectBin, onOpenCount }: { onSelectBin: (bin: string) => void; onOpenCount: (id: number) => void }) {
  const [data, setData] = useState<ProgressData | null>(null)

  useEffect(() => { fetch('/api/cyclecount?view=progress').then(r => r.json()).then(setData) }, [])

  if (!data) return <div className="p-12 text-center text-orange-800 text-sm">Loading...</div>

  const pct = data.totalBins > 0 ? Math.round((data.countedBins / data.totalBins) * 100) : 0

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Overall progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-3xl font-black text-white tabular-nums">{data.countedBins}<span className="text-orange-700 text-lg">/{data.totalBins}</span></div>
            <div className="text-[10px] text-orange-700 font-bold uppercase tracking-[0.2em]">Bins Counted</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-orange-400 tabular-nums">{pct}%</div>
            <div className="text-[10px] text-orange-700 font-bold uppercase tracking-[0.2em]">Complete</div>
          </div>
        </div>
        <div className="w-full bg-orange-950 rounded-full h-3">
          <div className={cn('h-3 rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-orange-500')} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-orange-300/40 mt-3">
          {data.totalTrusted} product counts established as trusted source of truth.
          {data.countedBins === 0 && ' Start by selecting a bin and doing your first hard count.'}
        </p>
      </div>

      {/* By rack */}
      <div className="card p-5">
        <p className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] mb-4">Progress by Rack</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {data.racks.map(r => {
            const rackPct = r.total_bins > 0 ? Math.round((r.counted_bins / r.total_bins) * 100) : 0
            return (
              <div key={r.rack} className="bg-[#12100d] border border-orange-900/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-white">Rack {r.rack}</span>
                  <span className={cn('text-xs font-bold tabular-nums', rackPct === 100 ? 'text-emerald-400' : rackPct > 0 ? 'text-orange-400' : 'text-orange-900')}>
                    {rackPct}%
                  </span>
                </div>
                <div className="w-full bg-orange-950 rounded-full h-1.5 mb-1">
                  <div className={cn('h-1.5 rounded-full', rackPct === 100 ? 'bg-emerald-500' : rackPct > 0 ? 'bg-orange-500' : 'bg-orange-950')} style={{ width: `${rackPct}%` }} />
                </div>
                <span className="text-[10px] text-orange-800 tabular-nums">{r.counted_bins}/{r.total_bins} bins</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent counts */}
      {data.recentCounts.length > 0 && (
        <div className="card p-5">
          <p className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] mb-3">Recent Counts</p>
          <div className="flex flex-col gap-1">
            {data.recentCounts.map(c => (
              <button
                key={c.id}
                onClick={() => onOpenCount(c.id)}
                className="flex items-center gap-3 text-left hover:bg-orange-950/40 rounded-lg p-2.5 -mx-2 transition-colors group"
              >
                {c.status === 'completed'
                  ? <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <Shield className="w-4 h-4 text-orange-500 shrink-0" />
                }
                <span className="font-mono text-xs text-orange-400 font-medium">{c.bin_name}</span>
                <span className={cn('badge text-[10px]',
                  c.count_type === 'follow_up' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-orange-300 bg-orange-500/10 border-orange-500/20'
                )}>
                  {c.count_type === 'follow_up' ? 'Follow-up' : 'Hard Count'}
                </span>
                <span className="text-xs text-orange-300/40">{c.counted_by}</span>
                <span className="text-xs text-orange-800 ml-auto">{c.line_count} items</span>
                <span className="text-xs text-orange-900">{fmtDelta(c.started_at)}</span>
                <ChevronRight className="w-3.5 h-3.5 text-orange-900 group-hover:text-orange-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bin List (select a bin to count) ──

function BinListView({ onStartCount }: { onStartCount: (id: number) => void }) {
  const [bins, setBins] = useState<BinInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [counterName, setCounterName] = useState('')
  const [starting, setStarting] = useState<string | null>(null)
  const [rackFilter, setRackFilter] = useState('')

  useEffect(() => {
    fetch('/api/cyclecount?view=bins').then(r => r.json()).then(d => { setBins(d.bins || []); setLoading(false) })
  }, [])

  const startCount = async (bin: string, type: 'hard_count' | 'follow_up') => {
    if (!counterName.trim()) return
    setStarting(bin)
    const res = await fetch('/api/cyclecount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bin_name: bin, counted_by: counterName.trim(), count_type: type }),
    })
    const data = await res.json()
    setStarting(null)
    if (data.id) onStartCount(data.id)
  }

  const filtered = bins.filter(b => {
    if (search && !b.bin_name.toLowerCase().includes(search.toLowerCase())) return false
    if (rackFilter && !b.bin_name.startsWith(`SFS-${rackFilter}-`)) return false
    return true
  })

  const racks = [...new Set(bins.map(b => { const m = b.bin_name.match(/^SFS-([A-Z])-/); return m ? m[1] : null }).filter(Boolean))] as string[]

  return (
    <div className="p-6 flex flex-col gap-4">
      {/* Counter name */}
      <div className="card p-4 bg-[#12100d]">
        <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">Who is counting?</label>
        <input className="input w-full max-w-xs" placeholder="Enter your name..." value={counterName} onChange={e => setCounterName(e.target.value)} />
      </div>

      {/* Rack filter + search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setRackFilter('')} className={cn('px-2 py-1.5 rounded text-xs font-bold transition-colors', !rackFilter ? 'bg-orange-500/15 text-orange-400' : 'text-orange-800 hover:text-orange-400')}>All</button>
          {racks.map(r => (
            <button key={r} onClick={() => setRackFilter(rackFilter === r ? '' : r)}
              className={cn('px-2 py-1.5 rounded text-xs font-bold transition-colors',
                rackFilter === r ? 'bg-orange-500/15 text-orange-400' : 'text-orange-800 hover:text-orange-400'
              )}>{r}</button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-800 pointer-events-none" />
          <input className="input w-full pl-9" placeholder="Search bins..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {!counterName.trim() && <p className="text-xs text-orange-500 text-center">Enter your name above to start counting</p>}

      {/* Bin grid */}
      {loading ? (
        <div className="text-center text-orange-800 text-sm py-12">Loading bins...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map(bin => {
            const hasTrust = bin.trusted_products > 0
            return (
              <div key={bin.bin_name} className={cn('card p-3 transition-all', hasTrust && 'border-emerald-900/30')}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {hasTrust ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <Shield className="w-4 h-4 text-orange-800" />}
                    <span className="font-mono text-xs font-bold text-white">{bin.bin_name}</span>
                  </div>
                </div>
                {hasTrust && (
                  <div className="text-[10px] text-orange-300/40 mb-2">
                    {bin.trusted_products} products trusted · Last: {bin.last_counted ? fmtDelta(bin.last_counted) : 'never'} by {bin.last_counted_by}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => startCount(bin.bin_name, 'hard_count')}
                    disabled={!counterName.trim() || starting === bin.bin_name}
                    className="btn text-[10px] py-1 px-2 bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/30 disabled:opacity-30"
                  >
                    {starting === bin.bin_name ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
                    Hard Count
                  </button>
                  {hasTrust && (
                    <button
                      onClick={() => startCount(bin.bin_name, 'follow_up')}
                      disabled={!counterName.trim() || starting === bin.bin_name}
                      className="btn text-[10px] py-1 px-2 bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30 disabled:opacity-30"
                    >
                      <RotateCcw className="w-3 h-3" /> Follow-up
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Counting View ──

function CountingView({ countId, onBack }: { countId: number; onBack: () => void }) {
  const [data, setData] = useState<CountDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [newProductId, setNewProductId] = useState('')
  const [newQty, setNewQty] = useState('')
  const [completing, setCompleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => fetch(`/api/cyclecount/${countId}`).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  useEffect(() => { load() }, [countId])

  const addLine = async () => {
    if (!newProductId.trim() || !newQty.trim()) return
    // Look up product name
    const productName = data?.finaleStock.find(f => f.product_id === newProductId.trim())?.product_name || null
    await fetch(`/api/cyclecount/${countId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_line', product_id: newProductId.trim(), product_name: productName, quantity: parseFloat(newQty) }),
    })
    setNewProductId('')
    setNewQty('')
    inputRef.current?.focus()
    load()
  }

  const deleteLine = async (lineId: number) => {
    await fetch(`/api/cyclecount/${countId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_line', line_id: lineId }),
    })
    load()
  }

  const complete = async () => {
    setCompleting(true)
    await fetch(`/api/cyclecount/${countId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    })
    load()
    setCompleting(false)
  }

  if (loading || !data) return <div className="p-12 text-center text-orange-800 text-sm">Loading...</div>

  const { count, lines, trusted, finaleStock } = data
  const isComplete = count.status === 'completed'
  const isFollowUp = count.count_type === 'follow_up'
  const trustedMap = Object.fromEntries(trusted.map(t => [t.product_id, t]))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-orange-900/30 bg-[#12100d]">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="btn-ghost w-8 h-8 p-0 justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <MapPin className="w-5 h-5 text-orange-500" />
          <span className="font-mono text-lg font-black text-white">{count.bin_name}</span>
          <span className={cn('badge text-[10px]',
            isFollowUp ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-orange-300 bg-orange-500/10 border-orange-500/20'
          )}>
            {isFollowUp ? 'Follow-up Count' : 'Hard Count'}
          </span>
          {isComplete && <span className="badge text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Completed</span>}
          <span className="text-xs text-orange-800 ml-auto">By: <span className="text-orange-300/50">{count.counted_by}</span></span>
        </div>
        {!isComplete && (
          <div className="flex items-center gap-2 ml-11">
            <span className="text-xs text-orange-300/40">{lines.length} items counted</span>
            {lines.length > 0 && (
              <button onClick={complete} disabled={completing} className="btn-primary text-[10px] py-1 px-3 ml-auto">
                {completing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                {completing ? 'Saving...' : 'Save as Trusted Count'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add product row */}
      {!isComplete && (
        <div className="px-6 py-3 border-b border-orange-900/30 bg-[#0f0d0a] flex items-center gap-3">
          <input
            ref={inputRef}
            className="input flex-1 max-w-xs font-mono"
            placeholder="Product ID / SKU..."
            value={newProductId}
            onChange={e => setNewProductId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') document.getElementById('qty-input')?.focus() }}
            list="product-suggestions"
          />
          <datalist id="product-suggestions">
            {finaleStock.map(f => <option key={f.product_id} value={f.product_id}>{f.product_name}</option>)}
          </datalist>
          <input
            id="qty-input"
            className="input w-24 text-center font-mono"
            placeholder="Qty"
            type="number"
            min="0"
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addLine() }}
          />
          <button onClick={addLine} disabled={!newProductId.trim() || !newQty.trim()} className="btn-primary text-xs py-2 px-3">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      )}

      {/* Lines */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-1.5">
        {lines.length === 0 && !isComplete && (
          <div className="text-center py-12">
            <Shield className="w-10 h-10 text-orange-900 mx-auto mb-3" />
            <p className="text-sm text-orange-300/40">Start scanning or entering products.</p>
            <p className="text-xs text-orange-800 mt-1">Enter each product ID and its physical count.</p>
          </div>
        )}
        {lines.map(line => {
          const prev = trustedMap[line.product_id]
          const finaleItem = finaleStock.find(f => f.product_id === line.product_id)
          const prevDelta = prev ? line.quantity - prev.quantity : null
          const finaleDelta = finaleItem ? line.quantity - Math.round(finaleItem.net_qty) : null

          return (
            <div key={line.id} className={cn('card p-3 flex items-center gap-4',
              isFollowUp && prevDelta !== null && prevDelta !== 0 && 'border-red-500/30 bg-red-500/5'
            )}>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs font-bold text-white">{line.product_id}</div>
                {line.product_name && line.product_name !== line.product_id && (
                  <div className="text-[10px] text-orange-300/30 truncate">{line.product_name}</div>
                )}
              </div>

              {/* Current count */}
              <div className="text-center w-20">
                <div className="text-[10px] text-orange-700 font-bold uppercase">Count</div>
                <div className="text-lg font-black text-white tabular-nums">{line.quantity}</div>
              </div>

              {/* Previous trusted (follow-up only) */}
              {isFollowUp && (
                <div className="text-center w-20">
                  <div className="text-[10px] text-orange-700 font-bold uppercase">Previous</div>
                  <div className="text-lg font-black text-orange-300/50 tabular-nums">{prev ? prev.quantity : '—'}</div>
                </div>
              )}

              {/* Delta from previous */}
              {isFollowUp && prevDelta !== null && (
                <div className="text-center w-16">
                  <div className="text-[10px] text-orange-700 font-bold uppercase">Delta</div>
                  <div className={cn('text-sm font-bold tabular-nums',
                    prevDelta === 0 ? 'text-emerald-400' : prevDelta < 0 ? 'text-red-400' : 'text-amber-400'
                  )}>
                    {prevDelta === 0 ? <Check className="w-4 h-4 mx-auto" /> : `${prevDelta > 0 ? '+' : ''}${prevDelta}`}
                  </div>
                </div>
              )}

              {/* Finale comparison (informational only) */}
              <div className="text-center w-20">
                <div className="text-[10px] text-orange-700 font-bold uppercase">Finale</div>
                <div className="text-sm text-orange-800 tabular-nums">{finaleItem ? Math.round(finaleItem.net_qty) : '—'}</div>
              </div>

              {!isComplete && (
                <button onClick={() => deleteLine(line.id)} className="btn-ghost w-7 h-7 p-0 justify-center shrink-0 text-orange-900 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        })}

        {/* Summary after completion */}
        {isComplete && isFollowUp && lines.length > 0 && (
          <div className="card p-4 mt-4 border-orange-500/20">
            <p className="text-[10px] font-bold text-orange-600 uppercase tracking-[0.2em] mb-2">Follow-up Summary</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-black text-emerald-400 tabular-nums">
                  {lines.filter(l => { const p = trustedMap[l.product_id]; return p && l.quantity === p.quantity }).length}
                </div>
                <div className="text-[10px] text-orange-700 uppercase">Matched</div>
              </div>
              <div>
                <div className="text-xl font-black text-red-400 tabular-nums">
                  {lines.filter(l => { const p = trustedMap[l.product_id]; return p && l.quantity !== p.quantity }).length}
                </div>
                <div className="text-[10px] text-orange-700 uppercase">Changed</div>
              </div>
              <div>
                <div className="text-xl font-black text-amber-400 tabular-nums">
                  {lines.filter(l => !trustedMap[l.product_id]).length}
                </div>
                <div className="text-[10px] text-orange-700 uppercase">New</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
