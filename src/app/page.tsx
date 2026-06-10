'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp, Search,
  Filter, RefreshCw, Plus, ChevronRight, Bell, BarChart2,
  Package, MapPin, User, ArrowUpDown, Zap, Database, ClipboardCheck, X,
  Compass, Anchor, FileSpreadsheet, Settings, Shield
} from 'lucide-react'
import { cn, TYPE_LABELS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, fmtDelta } from '@/lib/utils'
import type { Discrepancy, DashboardStats } from '@/lib/db'
import DiscrepancyModal from '@/components/DiscrepancyModal'
import NewDiscrepancyModal from '@/components/NewDiscrepancyModal'
import ReportModal from '@/components/ReportModal'
import FinalePanel from '@/components/FinalePanel'
import ValidationPanel from '@/components/ValidationPanel'
import SheetsPanel from '@/components/SheetsPanel'
import SettingsPanel from '@/components/SettingsPanel'
import CycleCountPanel from '@/components/CycleCountPanel'
import ReconcileTab from '@/components/ReconcileTab'
import FinaleReportPanel from '@/components/FinaleReportPanel'

interface HotBin { bin: string; count: number; critical_count: number }

interface StatsData {
  stats: DashboardStats
  byType: { type: string; count: number }[]
  recentActivity: Partial<Discrepancy>[]
  hotBins: HotBin[]
}

interface ListData {
  rows: Discrepancy[]
  total: number
  page: number
  limit: number
}

const REFRESH_INTERVAL = 30_000

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'reconcile' | 'cyclecount' | 'finalereport'>('home')
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [listData, setListData] = useState<ListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [binFilter, setBinFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showFinale, setShowFinale] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [showSheets, setShowSheets] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCycleCount, setShowCycleCount] = useState(false)

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats')
    setStatsData(await res.json())
  }, [])

  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      ...(statusFilter !== 'all'   && { status: statusFilter }),
      ...(priorityFilter !== 'all' && { priority: priorityFilter }),
      ...(binFilter                && { bin: binFilter }),
      ...(search                   && { q: search }),
    })
    const res = await fetch(`/api/discrepancies?${params}`)
    setListData(await res.json())
  }, [page, statusFilter, priorityFilter, binFilter, search])

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    await Promise.all([fetchStats(), fetchList()])
    if (!silent) setRefreshing(false)
  }, [fetchStats, fetchList])

  useEffect(() => { fetchStats().then(() => setLoading(false)); fetchList() }, [fetchStats, fetchList])
  useEffect(() => { const id = setInterval(() => refresh(true), REFRESH_INTERVAL); return () => clearInterval(id) }, [refresh])
  useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, binFilter, search])

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#0a0c10] flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nami-bg.png" alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-30" />
        <div className="absolute inset-0 bg-[#0a0c10]/70" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Compass className="w-8 h-8 animate-spin text-orange-500" />
          <span className="text-sm font-black tracking-[0.3em] uppercase text-orange-400">Charting course...</span>
        </div>
      </div>
    )
  }

  const { stats, byType, recentActivity, hotBins } = statsData!

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0c10]">
      {/* Top nav — orange gradient border */}
      <header className="h-16 border-b border-orange-900/40 bg-gradient-to-r from-[#0d0a07] via-[#12100d] to-[#0d0a07] flex items-center px-6 gap-5 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://thepacklabs.com/wp-content/uploads/2025/03/packlogo.png"
            alt="The Pack Labs"
            className="h-8 w-auto"
          />
          <div className="w-px h-8 bg-orange-900/40" />
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nami.png" alt="Nami" className="h-9 w-auto object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="text-lg font-black text-orange-400 tracking-tight uppercase">Nami</span>
          </div>
        </div>

        {/* Top-level tabs */}
        <div className="flex items-center gap-1 mx-4">
          <button
            onClick={() => setActiveTab('home')}
            className={cn('px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors',
              activeTab === 'home' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-800 hover:text-orange-400'
            )}
          >
            <Anchor className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Home
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn('px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors',
              activeTab === 'dashboard' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-800 hover:text-orange-400'
            )}
          >
            <BarChart2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Dashboard
          </button>
          <button
            onClick={() => setActiveTab('finalereport')}
            className={cn('px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors',
              activeTab === 'finalereport' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-800 hover:text-orange-400'
            )}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />Finale Report
          </button>
        </div>

        <div className="flex-1" />

<button onClick={() => setShowSheets(true)} className="btn text-xs bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/30">
          <FileSpreadsheet className="w-4 h-4" /> Counts
        </button>

        <button onClick={() => setShowReport(true)} className="btn-ghost text-xs">
          <BarChart2 className="w-4 h-4" /> Report
        </button>
        <button onClick={() => setShowNew(true)} className="btn-primary text-xs">
          <Plus className="w-4 h-4" /> Log Issue
        </button>
        <button onClick={() => refresh()} disabled={refreshing} className="btn-ghost w-9 h-9 p-0 justify-center rounded-lg" title="Refresh">
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </button>
        <button onClick={() => setShowSettings(true)} className="btn-ghost w-9 h-9 p-0 justify-center rounded-lg" title="Settings">
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {activeTab === 'reconcile' ? (
        <ReconcileTab />
      ) : activeTab === 'cyclecount' ? (
        <CycleCountPanel onClose={() => setActiveTab('dashboard')} inline />
      ) : activeTab === 'finalereport' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <FinaleReportPanel onClose={() => setActiveTab('dashboard')} />
        </div>
      ) : activeTab === 'home' ? (
        /* ── Pure Home tab: entire artwork visible, no scroll ── */
        <div className="flex-1 bg-[#0a0c10] flex items-center justify-center overflow-hidden p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nami-bg.png"
            alt="Nami"
            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 64px)', objectFit: 'contain', display: 'block' }}
          />
        </div>
      ) : (
        /* ── Dashboard tab: compact stats + activity ── */
        <div className="flex-1 overflow-auto p-6">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Issues" value={statsData?.stats.total ?? 0} icon={<Database className="w-5 h-5" />} color="text-orange-400" bg="bg-orange-500/10" border="border-orange-900/40" />
            <StatCard label="Open" value={statsData?.stats.open ?? 0} icon={<AlertTriangle className="w-5 h-5" />} color="text-red-400" bg="bg-red-500/10" border="border-red-900/40" pulse={(statsData?.stats.open ?? 0) > 0} />
            <StatCard label="Resolved" value={statsData?.stats.resolved ?? 0} icon={<CheckCircle2 className="w-5 h-5" />} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-900/40" />
            <StatCard label="Hot Bins" value={statsData?.hotBins?.length ?? 0} icon={<MapPin className="w-5 h-5" />} color="text-orange-300" bg="bg-orange-500/10" border="border-orange-900/40" />
          </div>

          {/* Recent activity + hot bins */}
          <div className="grid grid-cols-2 gap-4">
            {/* Recent Activity */}
            <div className="card p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-700 mb-3 flex items-center gap-2">
                <Clock className="w-3 h-3" /> Recent Activity
              </h3>
              {statsData?.recentActivity && statsData.recentActivity.length > 0 ? (
                <div className="flex flex-col divide-y divide-orange-900/20">
                  {statsData.recentActivity.slice(0, 8).map((a, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 text-xs">
                      <span className={cn('badge text-[10px] shrink-0', a.priority ? PRIORITY_COLORS[a.priority] : 'badge-orange')}>
                        {a.priority ? PRIORITY_LABELS[a.priority] : '—'}
                      </span>
                      <span className="font-mono text-orange-300 font-medium truncate">{a.sku}</span>
                      <span className="text-orange-600 truncate">{a.bin_location}</span>
                      <span className="text-orange-900 ml-auto whitespace-nowrap">{a.created_at ? fmtDelta(a.created_at) : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-900">No recent activity</p>
              )}
            </div>

            {/* Hot Bins */}
            <div className="card p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-700 mb-3 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Hot Bins
              </h3>
              {statsData?.hotBins && statsData.hotBins.length > 0 ? (
                <div className="flex flex-col divide-y divide-orange-900/20">
                  {statsData.hotBins.slice(0, 8).map((b, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 text-xs">
                      <span className="font-mono text-orange-400 font-bold w-6 text-right shrink-0">{i + 1}</span>
                      <span className="font-mono text-orange-300 font-medium flex-1">{b.bin}</span>
                      <span className="text-orange-600">{b.count} issues</span>
                      {b.critical_count > 0 && <span className="badge text-[10px] badge-red">{b.critical_count} critical</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-900">No hot bins</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedId && <DiscrepancyModal id={selectedId} onClose={() => setSelectedId(null)} onUpdate={refresh} />}
      {showNew && <NewDiscrepancyModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh() }} />}
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
      {showFinale && <FinalePanel onClose={() => setShowFinale(false)} onSync={() => refresh()} />}
      {showValidation && <ValidationPanel onClose={() => setShowValidation(false)} onDiscrepancyCreated={() => refresh()} />}
      {showSheets && <SheetsPanel onClose={() => setShowSheets(false)} onVariancesFound={() => refresh()} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showCycleCount && <CycleCountPanel onClose={() => setShowCycleCount(false)} />}
    </div>
  )
}

function StatCard({ label, value, icon, color, bg, border, pulse }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string; border: string; pulse?: boolean
}) {
  return (
    <div className={cn('rounded-xl p-4 flex items-center gap-4 border bg-[#12100d]', border, pulse && 'ring-1 ring-red-500/30')}>
      <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center shrink-0', bg, color)}>{icon}</div>
      <div>
        <div className="text-2xl font-black text-white tabular-nums">{value}</div>
        <div className="text-[10px] text-orange-700 font-semibold uppercase tracking-[0.15em]">{label}</div>
      </div>
    </div>
  )
}

function DiscrepancyRow({ row, onClick }: { row: Discrepancy; onClick: () => void }) {
  const delta = row.shipped_qty - row.expected_qty
  return (
    <tr onClick={onClick} className="hover:bg-orange-950/30 cursor-pointer transition-colors group">
      <td className="px-4 py-3">
        <span className={cn('badge text-[10px]', PRIORITY_COLORS[row.priority])}>
          <span className={cn('w-1.5 h-1.5 rounded-full', {
            'bg-red-500': row.priority === 'critical',
            'bg-orange-500': row.priority === 'high',
            'bg-orange-400': row.priority === 'medium',
            'bg-orange-800': row.priority === 'low',
          })} />
          {PRIORITY_LABELS[row.priority]}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-orange-200/50">{row.order_number}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-orange-800 shrink-0" />
          <span className="font-mono text-xs text-orange-100 font-medium">{row.sku}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-orange-800 shrink-0" />
          <span className="font-mono text-xs text-orange-400 font-medium">{row.bin_location}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-orange-200/60">{TYPE_LABELS[row.discrepancy_type]}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <ArrowUpDown className="w-3 h-3 text-orange-900" />
          <span className={cn('font-mono text-xs font-bold', delta < 0 ? 'text-red-400' : delta > 0 ? 'text-orange-400' : 'text-orange-700')}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
          <span className="text-xs text-orange-900">({row.expected_qty}/{row.shipped_qty})</span>
        </div>
      </td>
      <td className="px-4 py-3"><span className={cn('badge text-[10px]', STATUS_COLORS[row.status])}>{STATUS_LABELS[row.status]}</span></td>
      <td className="px-4 py-3">
        {row.assigned_name ? (
          <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-orange-800" /><span className="text-xs text-orange-200/60">{row.assigned_name}</span></div>
        ) : <span className="text-xs text-orange-900">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-orange-800 whitespace-nowrap">{fmtDelta(row.created_at)}</td>
      <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-orange-900 group-hover:text-orange-500 transition-colors" /></td>
    </tr>
  )
}
