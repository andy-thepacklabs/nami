'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, AlertTriangle, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'

interface TransferRecord {
  transferId: string
  transferDate: string
  note: string
  quantity: number
  productId: string
  productName: string
  originFacility: string
  destinationFacility: string
}

const DAY_OPTIONS = [7, 30, 60, 90]

function fmtDate(s: string) {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TransfersPanel() {
  const [records, setRecords] = useState<TransferRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function load(d = days) {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/transfers?days=${d}`)
      const data = await res.json()
      setRecords(data.records ?? [])
      if (data.error) setError(data.error)
      setLoaded(true)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function handleDays(d: number) { setDays(d); load(d) }

  function toggleDate(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const filtered = records.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.transferId.toLowerCase().includes(q) ||
      r.productId.toLowerCase().includes(q) ||
      r.productName.toLowerCase().includes(q) ||
      r.originFacility.toLowerCase().includes(q) ||
      r.destinationFacility.toLowerCase().includes(q)
  })

  // Group by date
  const dateMap = new Map<string, TransferRecord[]>()
  for (const r of filtered) {
    const key = r.transferDate || 'Unknown'
    if (!dateMap.has(key)) dateMap.set(key, [])
    dateMap.get(key)!.push(r)
  }
  const sortedDates = Array.from(dateMap.entries()).sort(([a], [b]) => b.localeCompare(a))

  const totalTransfers = filtered.length
  const totalUnits     = filtered.reduce((s, r) => s + r.quantity, 0)
  const locations      = new Set([...filtered.map(r => r.originFacility), ...filtered.map(r => r.destinationFacility)]).size

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-white font-semibold text-sm">Transfer Between Locations</h3>
          <p className="text-white/40 text-xs mt-0.5">Stock movements between bins, warehouses, or facilities</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1 py-1">
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => handleDays(d)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${days === d ? 'bg-orange-500/20 text-orange-400' : 'text-white/40 hover:text-white'}`}>
                {d}d
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product, facility…"
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30 w-40" />
          <button onClick={() => load()} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 rounded px-3 py-1.5 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {loaded && !loading && (
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Transfers</div>
            <div className="text-white font-bold text-xl">{totalTransfers}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Units Moved</div>
            <div className="text-orange-400 font-bold text-xl">{totalUnits.toLocaleString()}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Locations</div>
            <div className="text-sky-400 font-bold text-xl">{locations}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 text-red-400 text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Date-grouped list */}
      <div className="flex-1 overflow-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Fetching transfers from Finale…
          </div>
        ) : !loaded ? (
          <div className="flex items-center justify-center h-48 text-white/20 text-xs">Click Refresh to load</div>
        ) : sortedDates.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm">No transfers found for this period</div>
        ) : (
          sortedDates.map(([dateKey, items]) => {
            const isOpen = expanded.has(dateKey)
            const dayUnits = items.reduce((s, r) => s + r.quantity, 0)

            return (
              <div key={dateKey} className="border border-white/10 rounded-lg overflow-hidden">
                <button onClick={() => toggleDate(dateKey)}
                  className="w-full flex items-center px-4 py-3 bg-white/5 hover:bg-white/[0.08] transition-colors text-left">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 mr-3" />
                    : <ChevronRight className="w-4 h-4 text-white/40 shrink-0 mr-3" />}
                  <span className="text-white font-semibold text-sm flex-1">{fmtDate(dateKey)}</span>
                  <div className="flex items-center gap-6 text-xs">
                    <span className="text-white/40">{items.length} transfers</span>
                    <span className="text-orange-400 font-mono">{dayUnits.toLocaleString()} units</span>
                  </div>
                </button>

                {isOpen && (
                  <table className="w-full text-xs border-collapse border-t border-white/10">
                    <thead>
                      <tr className="bg-black/30">
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">ID</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Product</th>
                        <th className="text-right text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Qty</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">From → To</th>
                        <th className="text-left text-white/30 uppercase tracking-widest px-4 py-2 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(r => (
                        <tr key={r.transferId} className="border-t border-white/5 hover:bg-white/[0.03]">
                          <td className="px-4 py-2 font-mono text-sky-400 font-semibold">{r.transferId}</td>
                          <td className="px-4 py-2">
                            <div className="font-mono text-white/80 text-[11px]">{r.productId}</div>
                            <div className="text-white/40 truncate max-w-xs">{r.productName}</div>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-white/70">{r.quantity.toLocaleString()}</td>
                          <td className="px-4 py-2">
                            <span className="flex items-center gap-1.5 text-white/60">
                              <span className="text-sky-400 font-semibold">{r.originFacility || '—'}</span>
                              <ArrowRight className="w-3 h-3 text-white/30" />
                              <span className="text-orange-400 font-semibold">{r.destinationFacility || '—'}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-white/40 truncate max-w-xs">{r.note || '—'}</td>
                        </tr>
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
