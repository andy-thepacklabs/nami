'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Zap, MapPin } from 'lucide-react'

interface BuildRecord {
  buildId: string
  status: string
  validation: string
  productId: string
  productName: string
  qtyToProduce: number
  startDate: string
  completeDateActual: string
  completeDate: string
  completedBy: string
}

const DAY_OPTIONS = [0, 7, 30]  // 0 = Today only

// Parse YYYY-MM-DD as local date (not UTC) to avoid off-by-one day in display
function localDateFromISO(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fmtDate(s: string) {
  if (!s) return '—'
  const d = localDateFromISO(s) ?? new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDayKey(b: BuildRecord) {
  return b.completeDateActual || b.startDate || ''
}

function getDayLabel(dateStr: string) {
  if (!dateStr) return 'Unknown'
  const d = localDateFromISO(dateStr)
  if (!d || isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === 'completed') return (
    <span className="flex items-center gap-1 text-green-400 font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" /> Completed
    </span>
  )
  if (s === 'canceled' || s === 'cancelled') return (
    <span className="flex items-center gap-1 text-white/30 font-semibold">
      <XCircle className="w-3.5 h-3.5" /> Canceled
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-orange-400 font-semibold">
      <RefreshCw className="w-3.5 h-3.5" /> {status}
    </span>
  )
}

function ValidationBadge({ validation }: { validation: string }) {
  const v = validation.toLowerCase()
  if (v === 'good') return (
    <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold">Good</span>
  )
  if (v.includes('missing')) return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[11px] font-bold">
      <AlertTriangle className="w-3 h-3" /> Missing Items
    </span>
  )
  return <span className="text-white/30 text-[11px]">{validation || '—'}</span>
}

interface LocationLine {
  productId: string
  locations: { facilityName: string; quantity: number }[]
  isSplit: boolean
  isWrong: boolean
  hasIssue: boolean
}

interface LocData { lines: LocationLine[]; issueCount: number }

function BuildRow({ build, locData, locChecking }: { build: BuildRecord; locData: LocData | null; locChecking: boolean }) {
  const [locOpen, setLocOpen] = useState(false)

  const hasIssues = (locData?.issueCount ?? 0) > 0

  return (
    <>
      <tr className="border-t border-white/5 hover:bg-white/[0.03]">
        <td className="px-4 py-2 font-mono text-sky-400 font-semibold">{build.buildId}</td>
        <td className="px-4 py-2">
          <div className="font-mono text-white/80 text-[11px]">{build.productId}</div>
          <div className="text-white/40 truncate max-w-xs">{build.productName}</div>
        </td>
        <td className="px-4 py-2 text-right font-mono text-white/70">{build.qtyToProduce.toLocaleString()}</td>
        <td className="px-4 py-2"><StatusBadge status={build.status} /></td>
        <td className="px-4 py-2"><ValidationBadge validation={build.validation} /></td>
        <td className="px-4 py-2 text-white/40">{fmtDate(build.startDate)}</td>
        <td className="px-4 py-2 text-white/60">{fmtDate(build.completeDateActual)}</td>
        <td className="px-4 py-2 text-white/50 font-medium">{build.completedBy || '—'}</td>
        <td className="px-4 py-2">
          {locChecking ? (
            <span className="flex items-center gap-1 text-white/30 text-[11px]">
              <MapPin className="w-3 h-3 animate-pulse" /> Checking…
            </span>
          ) : locData ? (
            hasIssues ? (
              <button onClick={() => setLocOpen(o => !o)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25 transition-colors">
                <MapPin className="w-3 h-3" />
                {locData.issueCount} issue{locData.issueCount !== 1 ? 's' : ''}
              </button>
            ) : (
              <span className="flex items-center gap-1 text-green-500/60 text-[11px]">
                <MapPin className="w-3 h-3" /> OK
              </span>
            )
          ) : null}
        </td>
      </tr>
      {locOpen && locData && locData.lines.length > 0 && (
        <tr className="border-t border-yellow-500/20 bg-yellow-500/5">
          <td colSpan={9} className="px-6 py-3">
            <div className="text-[11px] text-white/50 uppercase tracking-widest mb-2 font-semibold">Component Locations</div>
            <div className="space-y-1.5">
              {locData.lines.filter(l => l.hasIssue).map(line => (
                <div key={line.productId} className={`flex items-start gap-3 rounded px-3 py-2 ${line.hasIssue ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5'}`}>
                  <div className="font-mono text-white/70 text-[11px] w-48 shrink-0 pt-0.5">{line.productId}</div>
                  <div className="flex flex-wrap gap-2 flex-1">
                    {line.locations.map((loc, i) => {
                      const APPROVED_KW = ['Production Main', 'Fulfillment Main', 'Jiko', 'Futurola', 'Qa/Qc', 'QaQc', 'Vape Station', 'AuraX']
                      const approved = APPROVED_KW.some(k => loc.facilityName.toLowerCase().includes(k.toLowerCase()))
                      return (
                        <span key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          approved ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {!approved && <AlertTriangle className="w-3 h-3" />}
                          {loc.facilityName} ({loc.quantity})
                        </span>
                      )
                    })}
                  </div>
                  {line.isSplit && <span className="text-yellow-400 text-[11px] font-bold shrink-0">Split!</span>}
                  {line.isWrong && <span className="text-red-400 text-[11px] font-bold shrink-0">Wrong location</span>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ProductionPanel() {
  const [builds, setBuilds] = useState<BuildRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [days, setDays] = useState(7)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [locationMap, setLocationMap] = useState<Map<string, LocData>>(new Map())
  const [locChecking, setLocChecking] = useState(false)

  async function batchCheckLocations(buildList: BuildRecord[]) {
    if (buildList.length === 0) return
    setLocChecking(true)
    try {
      const res = await fetch('/api/builds/check-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildIds: buildList.map(b => b.buildId) }),
      })
      const data = await res.json()
      const map = new Map<string, LocData>()
      for (const r of (data.results ?? [])) {
        map.set(r.buildId, { lines: r.lines, issueCount: r.issueCount })
        // Patch employee name into build list if returned
        if (r.completedBy || r.liveStatus) {
          setBuilds(prev => prev.map(b => b.buildId === r.buildId ? {
            ...b,
            ...(r.completedBy && !b.completedBy ? { completedBy: r.completedBy } : {}),
            ...(r.liveStatus ? { status: r.liveStatus } : {}),
          } : b))
        }
      }
      setLocationMap(map)
    } catch { /* ignore — non-critical */ }
    finally { setLocChecking(false) }
  }

  async function load(d = days) {
    setLoading(true)
    setError(null)
    setLocationMap(new Map())
    try {
      const res = await fetch(`/api/builds?days=${d}`)
      const data = await res.json()
      const list: BuildRecord[] = data.builds ?? []
      setBuilds(list)
      setSyncedAt(data.syncedAt ?? null)
      if (data.error) setError(data.error)
      setLoaded(true)
      // Auto-check locations for all loaded builds
      batchCheckLocations(list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const [syncProgress, setSyncProgress] = useState<{ page: number; total: number } | null>(null)

  async function syncFromFinale() {
    setSyncing(true)
    setError(null)
    setSyncProgress(null)
    try {
      const res = await fetch('/api/builds', { method: 'POST' })
      const data = await res.json()
      if (!data.started && data.reason !== 'already syncing') throw new Error(data.reason)

      // Poll progress every 2 seconds
      await new Promise<void>((resolve, reject) => {
        const timer = setInterval(async () => {
          try {
            const pr = await fetch('/api/builds?progress=1')
            const ps = await pr.json()
            setSyncProgress({ page: ps.page, total: ps.total })
            if (ps.status === 'done') {
              clearInterval(timer)
              setSyncedAt(ps.syncedAt)
              resolve()
            } else if (ps.status === 'error') {
              clearInterval(timer)
              reject(new Error(ps.error))
            }
          } catch (e) { clearInterval(timer); reject(e) }
        }, 2000)
      })

      await load(days)
    } catch (e) {
      setError(String(e))
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  const [backfilling, setBackfilling] = useState(false)

  async function backfillEmployees() {
    setBackfilling(true)
    try {
      await fetch('/api/builds/backfill-employees', { method: 'POST' })
      await load(days)
    } catch { /* ignore */ }
    finally { setBackfilling(false) }
  }

  useEffect(() => { load() }, [])

  function handleDays(d: number) {
    setDays(d)
    load(d)
  }

  function toggleDay(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const filtered = builds.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return b.buildId.toLowerCase().includes(q) ||
      b.productId.toLowerCase().includes(q) ||
      b.productName.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q)
  })

  // Group by day (use completeDateActual or startDate)
  const dayMap = new Map<string, BuildRecord[]>()
  for (const b of filtered) {
    const key = getDayKey(b)
    if (!dayMap.has(key)) dayMap.set(key, [])
    dayMap.get(key)!.push(b)
  }
  // Sort days descending
  const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) => b.localeCompare(a))

  const totalBuilds     = filtered.length
  const completed       = filtered.filter(b => b.status.toLowerCase() === 'completed').length
  const missingItems    = filtered.filter(b => b.validation.toLowerCase().includes('missing')).length
  const totalQty        = filtered.filter(b => b.status.toLowerCase() === 'completed')
                                  .reduce((s, b) => s + b.qtyToProduce, 0)

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-white font-semibold text-sm">Production / Manufacturing Runs</h3>
          <p className="text-white/40 text-xs mt-0.5">
            {syncedAt
              ? `Cached from Finale · Last sync: ${new Date(syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
              : 'Click "Sync from Finale" to load build data'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1 py-1">
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => handleDays(d)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${days === d ? 'bg-orange-500/20 text-orange-400' : 'text-white/40 hover:text-white'}`}>
                {d === 0 ? 'Today' : `${d}D`}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search build ID, product…"
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 w-44" />
          <button onClick={() => load()} disabled={loading || syncing}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 rounded px-3 py-1.5 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          <button onClick={syncFromFinale} disabled={syncing || loading}
            className="flex items-center gap-1.5 text-xs font-bold bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/30 rounded px-3 py-1.5 transition-colors disabled:opacity-50">
            <Zap className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} />
            {syncing
              ? syncProgress
                ? `Page ${syncProgress.page} · ${syncProgress.total.toLocaleString()}…`
                : 'Starting…'
              : syncedAt ? '⚡ Sync New' : '⚡ Full Sync'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {loaded && !loading && (
        <div className="grid grid-cols-4 gap-3 shrink-0">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Total Builds</div>
            <div className="text-white font-bold text-xl">{totalBuilds}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Completed</div>
            <div className="text-green-400 font-bold text-xl">{completed}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Missing Items</div>
            <div className="text-red-400 font-bold text-xl">{missingItems}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Units Produced</div>
            <div className="text-orange-400 font-bold text-xl">{totalQty.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 text-red-400 text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Day-grouped list */}
      <div className="flex-1 overflow-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Fetching builds from Finale…
          </div>
        ) : !loaded ? (
          <div className="flex items-center justify-center h-48 text-white/20 text-xs">Click Refresh to load builds</div>
        ) : sortedDays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-white/30 text-sm">
            <span>No builds found for this period</span>
            {!syncedAt && <span className="text-xs text-orange-400/60">Click "Sync from Finale" to pull the latest data</span>}
          </div>
        ) : (
          sortedDays.map(([dateKey, dayBuilds]) => {
            const isOpen = expanded.has(dateKey)
            const dayCompleted = dayBuilds.filter(b => b.status.toLowerCase() === 'completed').length
            const dayMissing   = dayBuilds.filter(b => b.validation.toLowerCase().includes('missing')).length
            const dayQty       = dayBuilds.filter(b => b.status.toLowerCase() === 'completed')
                                          .reduce((s, b) => s + b.qtyToProduce, 0)

            return (
              <div key={dateKey} className="border border-white/10 rounded-lg overflow-hidden">
                {/* Day header */}
                <button onClick={() => toggleDay(dateKey)}
                  className="w-full flex items-center px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                    : <ChevronRight className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                  }
                  <span className="text-white font-semibold text-sm flex-1">{getDayLabel(dateKey)}</span>
                  <div className="flex items-center gap-6 text-xs">
                    <span className="text-white/40">{dayBuilds.length} builds</span>
                    <span className="text-green-400">{dayCompleted} completed</span>
                    {dayMissing > 0 && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{dayMissing} missing</span>}
                    {dayQty > 0 && <span className="text-orange-400 font-mono">{dayQty.toLocaleString()} units</span>}
                  </div>
                </button>

                {/* Expanded builds */}
                {isOpen && (
                  <table className="w-full text-xs border-collapse border-t border-white/10">
                    <thead>
                      <tr className="bg-black/30">
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Build ID</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Product</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Qty</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Status</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Validation</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Start</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Completed</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">By</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Locations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayBuilds.map(b => (
                        <BuildRow key={b.buildId} build={b}
                          locData={locationMap.get(b.buildId) ?? null}
                          locChecking={locChecking && !locationMap.has(b.buildId)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
