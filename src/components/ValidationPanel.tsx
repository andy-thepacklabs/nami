'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Search, MapPin, Package, CheckCircle2, AlertTriangle,
  ChevronRight, ClipboardCheck, Play, ArrowRight, RefreshCw,
  Check, XCircle, Minus, Plus, ChevronLeft, FileText
} from 'lucide-react'
import { cn, fmtDelta } from '@/lib/utils'

interface BinSummary {
  facility_url: string
  facility_name: string
  product_count: number
  total_qty: number
}

interface ValidationSession {
  id: number
  facility_url: string
  facility_name: string
  counted_by: string
  status: string
  started_at: string
  completed_at: string | null
  notes: string | null
  total_items: number
  counted_items: number
  variance_items: number
}

interface CountLine {
  id: number
  session_id: number
  product_id: string
  product_name: string
  expected_qty: number
  hand_count: number | null
  variance: number | null
  status: string
  counted_at: string | null
  notes: string | null
}

interface SessionDetail {
  session: ValidationSession
  counts: CountLine[]
  summary: { total: number; counted: number; matched: number; variances: number }
}

type View = 'bins' | 'sessions' | 'counting'

export default function ValidationPanel({ onClose, onDiscrepancyCreated }: {
  onClose: () => void
  onDiscrepancyCreated: () => void
}) {
  const [view, setView] = useState<View>('bins')
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0a07] border border-orange-900/30 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-orange-900/30">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-orange-500" />
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Inventory Validation</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <button
              onClick={() => setView('bins')}
              className={cn('btn-ghost text-xs', view === 'bins' && 'text-orange-400 bg-orange-500/10')}
            >
              <MapPin className="w-3.5 h-3.5" /> Select Bin
            </button>
            <button
              onClick={() => setView('sessions')}
              className={cn('btn-ghost text-xs', view === 'sessions' && 'text-orange-400 bg-orange-500/10')}
            >
              <FileText className="w-3.5 h-3.5" /> History
            </button>
            <div className="w-px h-6 bg-orange-950/40 mx-1" />
            <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'bins' && (
            <BinSelector onStartCount={(sessionId) => {
              setActiveSessionId(sessionId)
              setView('counting')
            }} />
          )}
          {view === 'sessions' && (
            <SessionHistory onOpen={(id) => {
              setActiveSessionId(id)
              setView('counting')
            }} />
          )}
          {view === 'counting' && activeSessionId && (
            <CountingView
              sessionId={activeSessionId}
              onBack={() => setView('sessions')}
              onDiscrepancyCreated={onDiscrepancyCreated}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Pick a bin ──

function BinSelector({ onStartCount }: { onStartCount: (sessionId: number) => void }) {
  const [bins, setBins] = useState<BinSummary[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [counterName, setCounterName] = useState('')

  const load = async (q?: string) => {
    setLoading(true)
    const url = q ? `/api/validation/bins?q=${encodeURIComponent(q)}` : '/api/validation/bins'
    const res = await fetch(url)
    const data = await res.json()
    setBins(data.rows || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const startSession = async (bin: BinSummary) => {
    if (!counterName.trim()) return
    setStarting(bin.facility_url)
    const res = await fetch('/api/validation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facility_url: bin.facility_url,
        facility_name: bin.facility_name,
        counted_by: counterName.trim(),
      }),
    })
    const data = await res.json()
    setStarting(null)
    if (data.id) onStartCount(data.id)
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Counter name */}
      <div className="card p-4 bg-[#12100d]">
        <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">
          Who is counting?
        </label>
        <input
          className="input w-full max-w-xs"
          placeholder="Enter your name..."
          value={counterName}
          onChange={e => setCounterName(e.target.value)}
        />
      </div>

      {/* Search bins */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-700 pointer-events-none" />
        <input
          className="input w-full pl-9"
          placeholder="Search bins / locations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Bin grid */}
      {loading ? (
        <div className="text-center text-orange-700 text-sm py-12">Loading bins...</div>
      ) : bins.length === 0 ? (
        <div className="card p-8 text-center">
          <MapPin className="w-8 h-8 text-orange-900 mx-auto mb-3" />
          <p className="text-sm text-orange-300/50">No bins with stock found.</p>
          <p className="text-xs text-orange-900 mt-1">Run a Finale sync to load inventory data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {bins.map(bin => (
            <button
              key={bin.facility_url}
              onClick={() => startSession(bin)}
              disabled={!counterName.trim() || starting === bin.facility_url}
              className="card p-4 text-left hover:border-orange-500/30 hover:bg-orange-950/40 transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-orange-500" />
                  <span className="font-mono text-sm font-bold text-white">{bin.facility_name}</span>
                </div>
                {starting === bin.facility_url ? (
                  <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 text-orange-900 group-hover:text-orange-500 transition-colors" />
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-orange-700">
                <span><Package className="w-3 h-3 inline mr-1" />{bin.product_count} product{bin.product_count !== 1 ? 's' : ''}</span>
                <span>{Math.round(bin.total_qty)} total units</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!counterName.trim() && bins.length > 0 && (
        <p className="text-xs text-amber-400 text-center">Enter your name above to start counting</p>
      )}
    </div>
  )
}

// ── Session history ──

function SessionHistory({ onOpen }: { onOpen: (id: number) => void }) {
  const [sessions, setSessions] = useState<ValidationSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/validation')
      .then(r => r.json())
      .then(d => { setSessions(d.rows || []); setLoading(false) })
  }, [])

  if (loading) return <div className="p-6 text-center text-orange-700 text-sm">Loading...</div>

  if (sessions.length === 0) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <ClipboardCheck className="w-8 h-8 text-orange-900 mx-auto mb-3" />
          <p className="text-sm text-orange-300/50">No validation sessions yet.</p>
          <p className="text-xs text-orange-900 mt-1">Select a bin to start your first count.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-orange-900/30 bg-[#12100d]">
              {['Bin', 'Counted By', 'Status', 'Progress', 'Variances', 'Started', ''].map(h => (
                <th key={h} className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-orange-900/20/50">
            {sessions.map(s => (
              <tr
                key={s.id}
                onClick={() => onOpen(s.id)}
                className="hover:bg-orange-950/40 cursor-pointer transition-colors group"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-500" />
                    <span className="font-mono text-xs font-bold text-white">{s.facility_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-orange-200/70">{s.counted_by}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge text-[10px]',
                    s.status === 'completed' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                    'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  )}>
                    {s.status === 'completed' ? 'Complete' : 'In Progress'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-orange-300/50 tabular-nums">
                  {s.counted_items}/{s.total_items} items
                </td>
                <td className="px-4 py-3">
                  {s.variance_items > 0 ? (
                    <span className="badge text-[10px] text-red-400 bg-red-500/10 border-red-500/20">
                      <AlertTriangle className="w-3 h-3" /> {s.variance_items}
                    </span>
                  ) : s.counted_items > 0 ? (
                    <span className="text-xs text-orange-400">All match</span>
                  ) : (
                    <span className="text-xs text-orange-900">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-orange-700">{fmtDelta(s.started_at)}</td>
                <td className="px-4 py-3">
                  <ChevronRight className="w-4 h-4 text-orange-900 group-hover:text-orange-500 transition-colors" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Step 2: Counting view ──

function CountingView({ sessionId, onBack, onDiscrepancyCreated }: {
  sessionId: number
  onBack: () => void
  onDiscrepancyCreated: () => void
}) {
  const [data, setData] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'variance' | 'matched'>('all')

  const load = async () => {
    const res = await fetch(`/api/validation/${sessionId}`)
    const d = await res.json()
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [sessionId])

  const submitCount = async (countId: number, handCount: number, notes?: string) => {
    await fetch(`/api/validation/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count_id: countId, hand_count: handCount, notes }),
    })
    await load()
    onDiscrepancyCreated()
  }

  const completeSession = async () => {
    setCompleting(true)
    await fetch(`/api/validation/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    await load()
    setCompleting(false)
  }

  if (loading || !data) {
    return <div className="p-6 text-center text-orange-700 text-sm">Loading session...</div>
  }

  const { session, counts, summary } = data

  const filtered = counts.filter(c => {
    if (filter === 'pending')  return c.status === 'pending'
    if (filter === 'variance') return c.status === 'counted' && c.variance !== 0
    if (filter === 'matched')  return c.status === 'counted' && c.variance === 0
    return true
  })

  const pctComplete = summary.total > 0 ? Math.round((summary.counted / summary.total) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Session header */}
      <div className="px-6 py-4 border-b border-orange-900/30 bg-[#12100d]/30">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="btn-ghost w-8 h-8 p-0 justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <MapPin className="w-5 h-5 text-orange-500" />
          <span className="font-mono text-lg font-black text-white">{session.facility_name}</span>
          <span className={cn('badge text-[10px]',
            session.status === 'completed' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
            'text-amber-400 bg-amber-500/10 border-amber-500/20'
          )}>
            {session.status === 'completed' ? 'Complete' : 'In Progress'}
          </span>
          <span className="text-xs text-orange-700 ml-auto">Counted by: <span className="text-white">{session.counted_by}</span></span>
        </div>

        {/* Progress bar + stats */}
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-orange-950/40 rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', pctComplete === 100 ? 'bg-orange-500' : 'bg-amber-500')}
              style={{ width: `${pctComplete}%` }}
            />
          </div>
          <span className="text-xs text-orange-300/50 tabular-nums w-12">{pctComplete}%</span>

          <div className="flex items-center gap-3 text-xs">
            <StatPill icon={<Package className="w-3 h-3" />} label="Total" value={summary.total} color="text-orange-300/50" />
            <StatPill icon={<Check className="w-3 h-3" />} label="Matched" value={summary.matched} color="text-orange-400" />
            <StatPill icon={<AlertTriangle className="w-3 h-3" />} label="Variance" value={summary.variances} color="text-red-400" />
            <StatPill icon={<Minus className="w-3 h-3" />} label="Pending" value={summary.total - summary.counted} color="text-amber-400" />
          </div>

          {session.status !== 'completed' && summary.counted === summary.total && summary.total > 0 && (
            <button onClick={completeSession} disabled={completing} className="btn-primary text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> {completing ? 'Completing...' : 'Complete Session'}
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-orange-900/30 px-6">
        {([
          { key: 'all',      label: `All (${counts.length})` },
          { key: 'pending',  label: `Pending (${counts.filter(c => c.status === 'pending').length})` },
          { key: 'variance', label: `Variances (${summary.variances})` },
          { key: 'matched',  label: `Matched (${summary.matched})` },
        ] as { key: typeof filter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors',
              filter === key
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-orange-700 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Count lines */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="text-center text-orange-700 text-sm py-12">
            {filter === 'all' ? 'No products expected at this bin.' : 'No items match this filter.'}
          </div>
        )}
        {filtered.map(line => (
          <CountLineRow
            key={line.id}
            line={line}
            disabled={session.status === 'completed'}
            onSubmit={(handCount, notes) => submitCount(line.id, handCount, notes)}
          />
        ))}
      </div>
    </div>
  )
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={cn('flex items-center gap-1', color)}>
      {icon}
      <span className="font-bold tabular-nums">{value}</span>
      <span className="text-orange-700">{label}</span>
    </div>
  )
}

function CountLineRow({ line, disabled, onSubmit }: {
  line: CountLine
  disabled: boolean
  onSubmit: (handCount: number, notes?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [countVal, setCountVal] = useState(line.hand_count?.toString() ?? '')
  const [notes, setNotes] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const handleSubmit = () => {
    const val = parseFloat(countVal)
    if (isNaN(val) || val < 0) return
    onSubmit(val, notes || undefined)
    setEditing(false)
  }

  const isCounted = line.status === 'counted'
  const hasVariance = isCounted && line.variance !== 0

  return (
    <div className={cn(
      'card p-4 transition-all',
      hasVariance && 'border-red-500/30 bg-red-500/5',
      isCounted && !hasVariance && 'border-orange-500/20 bg-orange-500/5',
      editing && 'border-orange-500/50 ring-1 ring-orange-500/20'
    )}>
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          hasVariance ? 'bg-red-500/10 text-red-400' :
          isCounted ? 'bg-orange-500/10 text-orange-400' :
          'bg-orange-950/40 text-orange-700'
        )}>
          {hasVariance ? <XCircle className="w-4 h-4" /> :
           isCounted ? <CheckCircle2 className="w-4 h-4" /> :
           <Minus className="w-4 h-4" />}
        </div>

        {/* Product info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-white truncate">{line.product_id}</span>
          </div>
          {line.product_name && line.product_name !== line.product_id && (
            <div className="text-xs text-orange-300/50 truncate">{line.product_name}</div>
          )}
        </div>

        {/* Expected qty */}
        <div className="text-center shrink-0 w-24">
          <div className="text-[10px] text-orange-700 font-bold uppercase tracking-widest">Finale</div>
          <div className="text-lg font-black text-white tabular-nums">{line.expected_qty}</div>
        </div>

        {/* Hand count / entry */}
        <div className="text-center shrink-0 w-32">
          <div className="text-[10px] text-orange-700 font-bold uppercase tracking-widest">Hand Count</div>
          {editing ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                ref={inputRef}
                type="number"
                min="0"
                value={countVal}
                onChange={e => setCountVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                className="input w-20 text-center text-lg font-bold py-1"
              />
            </div>
          ) : isCounted ? (
            <div className={cn('text-lg font-black tabular-nums', hasVariance ? 'text-red-400' : 'text-orange-400')}>
              {line.hand_count}
            </div>
          ) : (
            <button
              onClick={() => { setEditing(true); setCountVal(line.expected_qty.toString()) }}
              disabled={disabled}
              className="mt-1 text-xs text-orange-500 hover:text-orange-400 font-bold uppercase tracking-wide disabled:opacity-30"
            >
              Enter Count
            </button>
          )}
        </div>

        {/* Variance */}
        <div className="text-center shrink-0 w-24">
          <div className="text-[10px] text-orange-700 font-bold uppercase tracking-widest">Variance</div>
          {isCounted ? (
            <div className={cn('text-lg font-black tabular-nums',
              line.variance === 0 ? 'text-orange-400' :
              (line.variance ?? 0) < 0 ? 'text-red-400' : 'text-amber-400'
            )}>
              {(line.variance ?? 0) > 0 ? '+' : ''}{line.variance}
            </div>
          ) : (
            <div className="text-lg text-orange-900">—</div>
          )}
        </div>

        {/* Actions */}
        {editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleSubmit} className="btn-primary text-xs py-1.5 px-3">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1.5 px-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isCounted && !disabled && !editing && (
          <button
            onClick={() => { setEditing(true); setCountVal(line.hand_count?.toString() ?? '') }}
            className="btn-ghost text-xs py-1.5 px-2 shrink-0"
            title="Recount"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Notes input when editing */}
      {editing && (
        <div className="mt-3 pl-12">
          <input
            className="input w-full text-xs"
            placeholder="Notes (optional) — what did you observe?"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          />
        </div>
      )}

      {/* Variance detail */}
      {hasVariance && line.notes && (
        <div className="mt-2 pl-12 text-xs text-orange-300/50">
          <span className="text-orange-700">Note:</span> {line.notes}
        </div>
      )}
      {hasVariance && !editing && (
        <div className="mt-2 pl-12 text-xs text-red-400/80">
          {(line.variance ?? 0) < 0
            ? `Missing ${Math.abs(line.variance!)} unit${Math.abs(line.variance!) !== 1 ? 's' : ''} — discrepancy auto-logged`
            : `Excess ${line.variance} unit${line.variance !== 1 ? 's' : ''} found — discrepancy auto-logged`
          }
        </div>
      )}
    </div>
  )
}
