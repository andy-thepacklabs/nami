'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search, MapPin, Package, CheckCircle2, AlertTriangle,
  ChevronRight, Play, RefreshCw, Check, XCircle, Minus,
  Plus, ChevronLeft, Trash2, Shield, ShieldCheck, BarChart2,
  ArrowRight, ChevronDown, ChevronUp, Zap, Info
} from 'lucide-react'
import { cn, fmtDelta } from '@/lib/utils'

interface BinInfo { bin_name: string; last_status: string | null; last_resolved: string | null; session_count: number }

interface ProgressData {
  totalBins: number; resolvedBins: number
  inProgress: Record<string, unknown>[]
  recent: (Record<string, unknown> & { total_lines: number; matched_lines: number; variance_lines: number; resolved_lines: number })[]
  racks: { rack: string; total_bins: number; resolved_bins: number }[]
}

interface ReconcileLine {
  id: number; product_id: string; product_name: string
  hand_count: number; finale_qty: number | null; variance: number | null
  analysis: string | null; resolution: string | null; resolved_qty: number | null; resolved_by: string | null
}

interface AnalysisData {
  line: ReconcileLine
  analysis: {
    reasons: string[]
    breakdown: { transfersIn: number; transfersOut: number; buildsConsumed: number; buildsProduced: number; computedNet: number; duplicateImpact: number; inactiveSourceQty: number }
    recentTransfersIn: { quantity: number; send_date: string; from_name: string }[]
    recentTransfersOut: { quantity: number; send_date: string; to_name: string }[]
    recentBuilds: { quantity: number; complete_date: string; work_effort_id: string }[]
    duplicates: { quantity: number; send_date: string; cnt: number }[]
    fromInactive: { quantity: number; send_date: string; facility_name: string }[]
  }
}

type Step = 'select' | 'count' | 'compare' | 'resolve'

export default function ReconcileTab() {
  const [step, setStep] = useState<Step>('select')
  const [sessionId, setSessionId] = useState<number | null>(null)

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      {step === 'select' && (
        <SelectBin onStart={(id) => { setSessionId(id); setStep('count') }} />
      )}
      {step === 'count' && sessionId && (
        <CountStep sessionId={sessionId} onNext={() => setStep('compare')} onBack={() => { setSessionId(null); setStep('select') }} />
      )}
      {step === 'compare' && sessionId && (
        <CompareStep sessionId={sessionId} onBack={() => setStep('count')} />
      )}
    </div>
  )
}

// ── Step 1: Select a bin ──

function SelectBin({ onStart }: { onStart: (id: number) => void }) {
  const [bins, setBins] = useState<BinInfo[]>([])
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rackFilter, setRackFilter] = useState('')
  const [counterName, setCounterName] = useState('')
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/reconcile?view=bins').then(r => r.json()),
      fetch('/api/reconcile?view=progress').then(r => r.json()),
    ]).then(([b, p]) => { setBins(b.bins || []); setProgress(p); setLoading(false) })
  }, [])

  const start = async (bin: string) => {
    if (!counterName.trim()) return
    setStarting(bin)
    const res = await fetch('/api/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bin_name: bin, counted_by: counterName.trim() }),
    })
    const data = await res.json()
    setStarting(null)
    if (data.id) onStart(data.id)
  }

  const racks = [...new Set(bins.map(b => { const m = b.bin_name.match(/^SFS-([A-Z])-/); return m ? m[1] : null }).filter(Boolean))] as string[]
  const filtered = bins.filter(b => {
    if (search && !b.bin_name.toLowerCase().includes(search.toLowerCase())) return false
    if (rackFilter && !b.bin_name.startsWith(`SFS-${rackFilter}-`)) return false
    return true
  })

  if (loading) return <div className="p-12 text-center text-orange-800 text-sm">Loading...</div>

  const pct = progress ? Math.round((progress.resolvedBins / Math.max(progress.totalBins, 1)) * 100) : 0

  return (
    <div className="p-6 flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* Progress overview */}
      {progress && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Reconciliation Progress</h2>
              <p className="text-xs text-orange-300/40 mt-1">Hard count each bin, compare to Finale, resolve variances. One bin at a time.</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-orange-400 tabular-nums">{pct}%</div>
              <div className="text-[10px] text-orange-700 font-bold uppercase">{progress.resolvedBins}/{progress.totalBins} bins clean</div>
            </div>
          </div>
          <div className="w-full bg-orange-950 rounded-full h-3 mb-4">
            <div className={cn('h-3 rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-orange-500')} style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
            {progress.racks.map(r => {
              const rp = r.total_bins > 0 ? Math.round((r.resolved_bins / r.total_bins) * 100) : 0
              return (
                <button key={r.rack} onClick={() => setRackFilter(rackFilter === r.rack ? '' : r.rack)}
                  className={cn('bg-[#12100d] border rounded-lg p-2 text-center transition-colors',
                    rackFilter === r.rack ? 'border-orange-500/40' : 'border-orange-900/20 hover:border-orange-900/40'
                  )}>
                  <div className="text-sm font-black text-white">{r.rack}</div>
                  <div className="w-full bg-orange-950 rounded-full h-1 my-1">
                    <div className={cn('h-1 rounded-full', rp === 100 ? 'bg-emerald-500' : rp > 0 ? 'bg-orange-500' : 'bg-orange-950')} style={{ width: `${rp}%` }} />
                  </div>
                  <div className="text-[10px] text-orange-800 tabular-nums">{r.resolved_bins}/{r.total_bins}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Counter name + search */}
      <div className="flex items-center gap-4">
        <div>
          <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-1">Counted by</label>
          <input className="input w-48" placeholder="Your name..." value={counterName} onChange={e => setCounterName(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-1">Find bin</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-800 pointer-events-none" />
            <input className="input w-full pl-9" placeholder="Search bins..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {!counterName.trim() && <p className="text-xs text-orange-500">Enter your name to start</p>}

      {/* Bin grid */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
        {filtered.map(bin => {
          const resolved = bin.last_status === 'resolved'
          const inProgress = bin.last_status && !resolved
          return (
            <button
              key={bin.bin_name}
              onClick={() => start(bin.bin_name)}
              disabled={!counterName.trim() || starting === bin.bin_name}
              className={cn('card p-3 text-left transition-all disabled:opacity-30 hover:border-orange-500/30 group',
                resolved && 'border-emerald-900/30',
                inProgress && 'border-amber-900/30'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {resolved ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> :
                 inProgress ? <Shield className="w-4 h-4 text-amber-500" /> :
                 <Shield className="w-4 h-4 text-orange-900" />}
                <span className="font-mono text-xs font-bold text-white">{bin.bin_name}</span>
              </div>
              {resolved && <p className="text-[10px] text-emerald-500/60">Clean · {fmtDelta(bin.last_resolved!)}</p>}
              {inProgress && <p className="text-[10px] text-amber-500/60">In progress</p>}
              {!bin.last_status && <p className="text-[10px] text-orange-900">Not counted</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2: Count ──

function CountStep({ sessionId, onNext, onBack }: { sessionId: number; onNext: () => void; onBack: () => void }) {
  const [session, setSession] = useState<Record<string, unknown> | null>(null)
  const [lines, setLines] = useState<ReconcileLine[]>([])
  const [loading, setLoading] = useState(true)
  const [newPid, setNewPid] = useState('')
  const [newQty, setNewQty] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pidRef = useRef<HTMLInputElement>(null)

  const load = () => fetch(`/api/reconcile/${sessionId}`).then(r => r.json()).then(d => { setSession(d.session); setLines(d.lines); setLoading(false) })
  useEffect(() => { load() }, [sessionId])

  const addLine = async () => {
    if (!newPid.trim() || !newQty.trim()) return
    await fetch(`/api/reconcile/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_line', product_id: newPid.trim(), hand_count: parseFloat(newQty) }),
    })
    setNewPid(''); setNewQty('')
    pidRef.current?.focus()
    load()
  }

  const deleteLine = async (lineId: number) => {
    await fetch(`/api/reconcile/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_line', line_id: lineId }),
    })
    load()
  }

  const moveToCompare = async () => {
    setSubmitting(true)
    await fetch(`/api/reconcile/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'compare' }),
    })
    setSubmitting(false)
    onNext()
  }

  if (loading || !session) return <div className="p-12 text-center text-orange-800 text-sm">Loading...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-orange-900/30 bg-[#12100d]">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-ghost w-8 h-8 p-0 justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-orange-700 uppercase tracking-widest bg-orange-500/10 px-2 py-1 rounded">Step 1</span>
            <span className="text-sm font-bold text-white uppercase">Hard Count</span>
          </div>
          <MapPin className="w-4 h-4 text-orange-500 ml-2" />
          <span className="font-mono text-sm font-black text-orange-400">{session.bin_name as string}</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-orange-300/40">{lines.length} items</span>
            {lines.length > 0 && (
              <button onClick={moveToCompare} disabled={submitting} className="btn-primary text-xs">
                {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Compare to Finale
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Input row */}
      <div className="px-6 py-3 border-b border-orange-900/30 bg-[#0f0d0a] flex items-center gap-3">
        <input ref={pidRef} className="input flex-1 max-w-sm font-mono" placeholder="Product ID / SKU..." value={newPid} onChange={e => setNewPid(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') document.getElementById('count-qty')?.focus() }} />
        <input id="count-qty" className="input w-24 text-center font-mono" placeholder="Qty" type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addLine() }} />
        <button onClick={addLine} disabled={!newPid.trim() || !newQty.trim()} className="btn-primary text-xs py-2 px-3">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-1.5">
        {lines.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-10 h-10 text-orange-900 mx-auto mb-3" />
            <p className="text-sm text-orange-300/40">Go to the bin and count every product.</p>
            <p className="text-xs text-orange-800 mt-1">Enter product ID + quantity for each item on the shelf.</p>
          </div>
        )}
        {lines.map(line => (
          <div key={line.id} className="card p-3 flex items-center gap-4">
            <Package className="w-4 h-4 text-orange-800 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-bold text-white">{line.product_id}</div>
              {line.product_name && <div className="text-[10px] text-orange-300/30 truncate">{line.product_name}</div>}
            </div>
            <div className="text-lg font-black text-white tabular-nums w-20 text-center">{line.hand_count}</div>
            <button onClick={() => deleteLine(line.id)} className="btn-ghost w-7 h-7 p-0 justify-center text-orange-900 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 3: Compare + Analyze + Resolve ──

function CompareStep({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const [session, setSession] = useState<Record<string, unknown> | null>(null)
  const [lines, setLines] = useState<ReconcileLine[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLine, setExpandedLine] = useState<number | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [analyzingLine, setAnalyzingLine] = useState<number | null>(null)
  const [completing, setCompleting] = useState(false)
  const [filter, setFilter] = useState<'all' | 'variance' | 'match'>('all')

  const load = () => fetch(`/api/reconcile/${sessionId}`).then(r => r.json()).then(d => { setSession(d.session); setLines(d.lines); setLoading(false) })
  useEffect(() => { load() }, [sessionId])

  const analyze = async (lineId: number) => {
    if (expandedLine === lineId) { setExpandedLine(null); return }
    setExpandedLine(lineId)
    setAnalyzingLine(lineId)
    setAnalysis(null)
    const res = await fetch(`/api/reconcile/${sessionId}/analyze?line=${lineId}`)
    setAnalysis(await res.json())
    setAnalyzingLine(null)
  }

  const resolveLine = async (lineId: number, resolution: string, resolvedQty: number) => {
    await fetch(`/api/reconcile/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_line', line_id: lineId, resolution, resolved_qty: resolvedQty }),
    })
    load()
  }

  const complete = async () => {
    setCompleting(true)
    await fetch(`/api/reconcile/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    })
    load()
    setCompleting(false)
  }

  if (loading || !session) return <div className="p-12 text-center text-orange-800 text-sm">Loading...</div>

  const matched = lines.filter(l => l.variance === 0)
  const variances = lines.filter(l => l.variance !== null && l.variance !== 0)
  const allResolved = variances.every(l => l.resolution)
  const isComplete = session.status === 'resolved'

  const filtered = filter === 'variance' ? variances : filter === 'match' ? matched : lines

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-orange-900/30 bg-[#12100d]">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-ghost w-8 h-8 p-0 justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-orange-700 uppercase tracking-widest bg-orange-500/10 px-2 py-1 rounded">Step 2</span>
            <span className="text-sm font-bold text-white uppercase">Compare & Resolve</span>
          </div>
          <MapPin className="w-4 h-4 text-orange-500 ml-2" />
          <span className="font-mono text-sm font-black text-orange-400">{session.bin_name as string}</span>
          {isComplete && <span className="badge text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20 ml-2">Resolved</span>}
        </div>
        {/* Summary bar */}
        <div className="flex items-center gap-4 mt-3 ml-11">
          <Stat icon={<Check className="w-3 h-3" />} label="Match" value={matched.length} color="text-emerald-400" />
          <Stat icon={<AlertTriangle className="w-3 h-3" />} label="Variance" value={variances.length} color="text-red-400" />
          <Stat icon={<CheckCircle2 className="w-3 h-3" />} label="Resolved" value={variances.filter(l => l.resolution).length} color="text-orange-400" />
          {!isComplete && allResolved && variances.length > 0 && (
            <button onClick={complete} disabled={completing} className="btn-primary text-xs ml-auto">
              {completing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Mark Bin Clean
            </button>
          )}
          {!isComplete && matched.length === lines.length && lines.length > 0 && (
            <button onClick={complete} disabled={completing} className="btn-primary text-xs ml-auto">
              {completing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              All Match — Mark Clean
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-orange-900/30 px-6">
        {(['all', 'variance', 'match'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors uppercase',
              filter === f ? 'border-orange-500 text-orange-400' : 'border-transparent text-orange-900 hover:text-orange-300'
            )}>
            {f === 'all' ? `All (${lines.length})` : f === 'variance' ? `Variances (${variances.length})` : `Matched (${matched.length})`}
          </button>
        ))}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-2">
        {filtered.map(line => {
          const isExpanded = expandedLine === line.id
          const hasVariance = line.variance !== null && line.variance !== 0
          return (
            <div key={line.id} className={cn('card overflow-hidden transition-all',
              hasVariance && !line.resolution && 'border-red-500/20',
              line.resolution && 'border-emerald-900/30',
              line.variance === 0 && 'border-emerald-900/20 opacity-70'
            )}>
              {/* Main row */}
              <div className={cn('p-3 flex items-center gap-4', hasVariance && 'cursor-pointer')} onClick={() => hasVariance && analyze(line.id)}>
                {line.variance === 0 ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> :
                 line.resolution ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> :
                 <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}

                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs font-bold text-white">{line.product_id}</div>
                  {line.product_name && <div className="text-[10px] text-orange-300/30 truncate">{line.product_name}</div>}
                </div>

                <div className="text-center w-20">
                  <div className="text-[10px] text-orange-700 font-bold uppercase">Hand</div>
                  <div className="text-base font-black text-white tabular-nums">{line.hand_count}</div>
                </div>
                <div className="text-center w-20">
                  <div className="text-[10px] text-orange-700 font-bold uppercase">Finale</div>
                  <div className="text-base font-black text-orange-300/50 tabular-nums">{line.finale_qty ?? '—'}</div>
                </div>
                <div className="text-center w-20">
                  <div className="text-[10px] text-orange-700 font-bold uppercase">Variance</div>
                  <div className={cn('text-base font-black tabular-nums',
                    line.variance === 0 ? 'text-emerald-400' : (line.variance ?? 0) < 0 ? 'text-red-400' : 'text-amber-400'
                  )}>
                    {line.variance === 0 ? '0' : `${(line.variance ?? 0) > 0 ? '+' : ''}${line.variance}`}
                  </div>
                </div>

                {line.resolution && (
                  <div className="badge text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shrink-0">
                    {line.resolution}
                  </div>
                )}

                {hasVariance && (
                  isExpanded ? <ChevronUp className="w-4 h-4 text-orange-700 shrink-0" /> : <ChevronDown className="w-4 h-4 text-orange-700 shrink-0" />
                )}
              </div>

              {/* Analysis panel */}
              {isExpanded && (
                <div className="border-t border-orange-900/30 bg-[#0f0d0a] p-4">
                  {analyzingLine === line.id ? (
                    <div className="flex items-center gap-2 text-orange-800 text-xs"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing...</div>
                  ) : analysis ? (
                    <AnalysisPanel analysis={analysis} line={line} onResolve={(res, qty) => resolveLine(line.id, res, qty)} isResolved={!!line.resolution} />
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AnalysisPanel({ analysis, line, onResolve, isResolved }: {
  analysis: AnalysisData; line: ReconcileLine; onResolve: (res: string, qty: number) => void; isResolved: boolean
}) {
  const { breakdown, reasons, recentTransfersIn, recentTransfersOut, duplicates, fromInactive } = analysis.analysis

  return (
    <div className="flex flex-col gap-4">
      {/* Why */}
      <div>
        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-[0.2em] mb-2">
          <Info className="w-3 h-3 inline mr-1 -mt-0.5" /> Analysis
        </p>
        {reasons.map((r, i) => (
          <p key={i} className="text-xs text-orange-200/60 mb-1">• {r}</p>
        ))}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <MiniStat label="Transferred In" value={`+${breakdown.transfersIn}`} />
        <MiniStat label="Transferred Out" value={`-${breakdown.transfersOut}`} />
        <MiniStat label="Built (consumed)" value={`-${breakdown.buildsConsumed}`} />
        <MiniStat label="Built (produced)" value={`+${breakdown.buildsProduced}`} />
        <MiniStat label="Finale Net" value={String(breakdown.computedNet)} highlight />
      </div>

      {/* Flags */}
      {duplicates.length > 0 && (
        <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
          <Zap className="w-3 h-3 inline mr-1" />
          {duplicates.length} duplicate transfer{duplicates.length > 1 ? 's' : ''} found — may inflate Finale by {breakdown.duplicateImpact} units
        </div>
      )}
      {fromInactive.length > 0 && (
        <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          {breakdown.inactiveSourceQty} units transferred from deactivated bins — suspect data
        </div>
      )}

      {/* Recent transfers */}
      {recentTransfersIn.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] mb-1">Recent Transfers In</p>
          {recentTransfersIn.slice(0, 5).map((t, i) => (
            <div key={i} className="text-[10px] text-orange-300/40 font-mono">+{t.quantity} from {t.from_name} · {t.send_date?.split('T')[0]}</div>
          ))}
        </div>
      )}
      {recentTransfersOut.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] mb-1">Recent Transfers Out</p>
          {recentTransfersOut.slice(0, 5).map((t, i) => (
            <div key={i} className="text-[10px] text-orange-300/40 font-mono">-{t.quantity} to {t.to_name} · {t.send_date?.split('T')[0]}</div>
          ))}
        </div>
      )}

      {/* Resolution buttons */}
      {!isResolved && (
        <div className="border-t border-orange-900/30 pt-3">
          <p className="text-[10px] font-bold text-orange-600 uppercase tracking-[0.2em] mb-2">Resolve</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onResolve('Hand count is correct', line.hand_count)} className="btn text-[10px] py-1.5 px-3 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30">
              <Check className="w-3 h-3" /> Trust Hand Count ({line.hand_count})
            </button>
            <button onClick={() => onResolve('Finale is correct', line.finale_qty ?? 0)} className="btn text-[10px] py-1.5 px-3 bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/30">
              <Check className="w-3 h-3" /> Trust Finale ({line.finale_qty})
            </button>
            <button onClick={() => {
              const qty = prompt('Enter the true quantity:')
              if (qty !== null) onResolve('Custom adjustment', parseFloat(qty))
            }} className="btn text-[10px] py-1.5 px-3 bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30">
              <Plus className="w-3 h-3" /> Custom Qty
            </button>
            <button onClick={() => onResolve('Variance accepted — will investigate', line.hand_count)} className="btn text-[10px] py-1.5 px-3 bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30">
              <AlertTriangle className="w-3 h-3" /> Flag for Investigation
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return <div className={cn('flex items-center gap-1 text-xs', color)}>{icon}<span className="font-bold tabular-nums">{value}</span><span className="text-orange-800">{label}</span></div>
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('bg-[#12100d] border border-orange-900/20 rounded-lg p-2 text-center', highlight && 'border-orange-500/30')}>
      <div className={cn('text-sm font-bold tabular-nums font-mono', highlight ? 'text-orange-400' : 'text-orange-200/60')}>{value}</div>
      <div className="text-[10px] text-orange-800 uppercase">{label}</div>
    </div>
  )
}
