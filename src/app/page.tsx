'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp, Search,
  Filter, RefreshCw, Plus, ChevronRight, Bell, BarChart2,
  Package, MapPin, User, ArrowUpDown, Zap, Database, ClipboardCheck, X
} from 'lucide-react'
import { cn, TYPE_LABELS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, fmtDelta } from '@/lib/utils'
import type { Discrepancy, DashboardStats } from '@/lib/db'
import DiscrepancyModal from '@/components/DiscrepancyModal'
import NewDiscrepancyModal from '@/components/NewDiscrepancyModal'
import ReportModal from '@/components/ReportModal'
import FinalePanel from '@/components/FinalePanel'
import ValidationPanel from '@/components/ValidationPanel'

interface HotBin {
  bin: string
  count: number
  critical_count: number
}

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

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats')
    const data = await res.json()
    setStatsData(data)
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
    const data = await res.json()
    setListData(data)
  }, [page, statusFilter, priorityFilter, binFilter, search])

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    await Promise.all([fetchStats(), fetchList()])
    if (!silent) setRefreshing(false)
  }, [fetchStats, fetchList])

  useEffect(() => {
    Promise.all([fetchStats(), fetchList()]).then(() => setLoading(false))
  }, [fetchStats, fetchList])

  useEffect(() => {
    const id = setInterval(() => refresh(true), REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, binFilter, search])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex items-center gap-3 text-neutral-400">
          <RefreshCw className="w-5 h-5 animate-spin text-lime-500" />
          <span className="text-sm font-medium tracking-wide">LOADING DASHBOARD...</span>
        </div>
      </div>
    )
  }

  const { stats, byType, recentActivity } = statsData!

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      {/* Top nav */}
      <header className="h-16 border-b border-neutral-800 bg-[#0f0f0f] flex items-center px-6 gap-5 sticky top-0 z-30">
        {/* Pack Labs Logo + Nami branding */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://thepacklabs.com/wp-content/uploads/2025/03/packlogo.png"
            alt="The Pack Labs"
            className="h-8 w-auto"
          />
          <div className="w-px h-8 bg-neutral-700" />
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-white tracking-tight uppercase">Nami</span>
            <span className="text-xs font-semibold text-neutral-500 tracking-widest uppercase hidden sm:block">
              Inventory Dashboard
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {stats.total_critical > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wide animate-pulse">
            <Bell className="w-3.5 h-3.5" />
            {stats.total_critical} Critical
          </div>
        )}
        <button onClick={() => setShowValidation(true)} className="btn-primary text-xs bg-amber-500 hover:bg-amber-400">
          <ClipboardCheck className="w-4 h-4" /> Validate
        </button>
        <button onClick={() => setShowFinale(true)} className="btn-ghost text-xs">
          <Database className="w-4 h-4" /> Finale
        </button>
        <button onClick={() => setShowReport(true)} className="btn-ghost text-xs">
          <BarChart2 className="w-4 h-4" /> Report
        </button>
        <button onClick={() => setShowNew(true)} className="btn-primary text-xs">
          <Plus className="w-4 h-4" /> Log Issue
        </button>
        <button
          onClick={() => refresh()}
          disabled={refreshing}
          className="btn-ghost w-9 h-9 p-0 justify-center rounded-lg"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r border-neutral-800 bg-[#0f0f0f] flex flex-col p-4 gap-1 shrink-0">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] px-2 mb-2">Status</p>
          {[
            { label: 'All Issues', value: 'all', count: stats.total_all },
            { label: 'Open',       value: 'open' },
            { label: 'In Review',  value: 'in_review' },
            { label: 'Escalated',  value: 'escalated', count: stats.total_escalated },
            { label: 'Resolved',   value: 'resolved' },
          ].map(({ label, value, count }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={cn(
                'flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-colors',
                statusFilter === value
                  ? 'bg-lime-500/10 text-lime-400 font-semibold'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              )}
            >
              <span>{label}</span>
              {count !== undefined && (
                <span className={cn('text-xs tabular-nums', statusFilter === value ? 'text-lime-400' : 'text-neutral-600')}>
                  {count}
                </span>
              )}
            </button>
          ))}

          <div className="border-t border-neutral-800 mt-3 pt-3">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] px-2 mb-2">Priority</p>
            {(['all','critical','high','medium','low'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm transition-colors',
                  priorityFilter === p
                    ? 'bg-lime-500/10 text-lime-400 font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                )}
              >
                {p !== 'all' && (
                  <span className={cn('w-2 h-2 rounded-full', {
                    'bg-red-500': p === 'critical',
                    'bg-amber-500': p === 'high',
                    'bg-blue-500': p === 'medium',
                    'bg-neutral-500': p === 'low',
                  })} />
                )}
                {p === 'all' ? 'All' : PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Hot Bins */}
          {statsData!.hotBins?.length > 0 && (
            <div className="border-t border-neutral-800 mt-3 pt-3">
              <div className="flex items-center justify-between px-2 mb-2">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">Hot Bins</p>
                {binFilter && (
                  <button
                    onClick={() => setBinFilter('')}
                    className="text-[10px] text-lime-500 hover:text-lime-400 font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
              {statsData!.hotBins.slice(0, 10).map(({ bin, count, critical_count }) => (
                <button
                  key={bin}
                  onClick={() => setBinFilter(binFilter === bin ? '' : bin)}
                  className={cn(
                    'flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-xs transition-colors',
                    binFilter === bin
                      ? 'bg-lime-500/10 text-lime-400 font-semibold'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  )}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3 h-3 shrink-0 text-neutral-600" />
                    <span className="font-mono truncate">{bin}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {critical_count > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    )}
                    <span className={cn('tabular-nums font-mono', binFilter === bin ? 'text-lime-400' : 'text-neutral-600')}>
                      {count}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {byType.length > 0 && (
            <div className="border-t border-neutral-800 mt-3 pt-3">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] px-2 mb-2">By Type</p>
              {byType.slice(0, 5).map(({ type, count }) => (
                <div key={type} className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-xs text-neutral-500 truncate">{TYPE_LABELS[type as keyof typeof TYPE_LABELS] ?? type}</span>
                  <span className="text-xs text-neutral-600 tabular-nums font-mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Open Issues"
              value={stats.total_open}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="text-amber-400"
              bg="bg-amber-500/10"
              border="border-amber-500/20"
            />
            <StatCard
              label="Critical"
              value={stats.total_critical}
              icon={<Zap className="w-5 h-5" />}
              color="text-red-400"
              bg="bg-red-500/10"
              border="border-red-500/20"
              pulse={stats.total_critical > 0}
            />
            <StatCard
              label="Escalated"
              value={stats.total_escalated}
              icon={<TrendingUp className="w-5 h-5" />}
              color="text-orange-400"
              bg="bg-orange-500/10"
              border="border-orange-500/20"
            />
            <StatCard
              label="Resolved Today"
              value={stats.resolved_today}
              icon={<CheckCircle2 className="w-5 h-5" />}
              color="text-lime-400"
              bg="bg-lime-500/10"
              border="border-lime-500/20"
            />
          </div>

          {/* Search + filters row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
              <input
                className="input w-full pl-9"
                placeholder="Search SKU, order, bin..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {binFilter && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-500/10 border border-lime-500/20">
                <MapPin className="w-3 h-3 text-lime-500" />
                <span className="text-xs font-mono font-bold text-lime-400">{binFilter}</span>
                <button onClick={() => setBinFilter('')} className="text-lime-500 hover:text-white ml-1">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
              <Filter className="w-3.5 h-3.5" />
              {listData?.total ?? 0} result{(listData?.total ?? 0) !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-900/50">
                    {['Priority', 'Order', 'SKU', 'Bin', 'Type', 'Qty Delta', 'Status', 'Assigned', 'Age', ''].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-neutral-500 px-4 py-3 whitespace-nowrap uppercase tracking-[0.15em]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {listData?.rows.map(row => (
                    <DiscrepancyRow
                      key={row.id}
                      row={row}
                      onClick={() => setSelectedId(row.id)}
                    />
                  ))}
                  {listData?.rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-neutral-500 text-sm">
                        No discrepancies match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {listData && listData.total > listData.limit && (
              <div className="flex items-center justify-between border-t border-neutral-800 px-4 py-3">
                <span className="text-xs text-neutral-500">
                  Showing {((page - 1) * listData.limit) + 1}–{Math.min(page * listData.limit, listData.total)} of {listData.total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-ghost text-xs px-3 py-1.5"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * listData.limit >= listData.total}
                    className="btn-ghost text-xs px-3 py-1.5"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Recent activity feed */}
          {recentActivity.length > 0 && (
            <div className="card p-4">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-3">Recent Activity</p>
              <div className="flex flex-col gap-1">
                {recentActivity.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id!)}
                    className="flex items-center gap-3 text-left hover:bg-neutral-800 rounded-lg p-2.5 -mx-2 transition-colors group"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-500 shrink-0" />
                    <span className="font-mono text-xs text-neutral-400">{item.order_number}</span>
                    <span className="text-xs text-neutral-300">{TYPE_LABELS[item.discrepancy_type as keyof typeof TYPE_LABELS]}</span>
                    <span className="font-mono text-xs text-neutral-500">{item.sku}</span>
                    <span className="font-mono text-xs text-neutral-500">{item.bin_location}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <span className={cn('badge text-[10px]', STATUS_COLORS[item.status as keyof typeof STATUS_COLORS])}>
                        {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}
                      </span>
                      <span className="text-xs text-neutral-600">{fmtDelta(item.created_at!)}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-700 group-hover:text-lime-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {selectedId && (
        <DiscrepancyModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={refresh}
        />
      )}
      {showNew && (
        <NewDiscrepancyModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refresh() }}
        />
      )}
      {showReport && (
        <ReportModal onClose={() => setShowReport(false)} />
      )}
      {showFinale && (
        <FinalePanel onClose={() => setShowFinale(false)} onSync={() => refresh()} />
      )}
      {showValidation && (
        <ValidationPanel
          onClose={() => setShowValidation(false)}
          onDiscrepancyCreated={() => refresh()}
        />
      )}
    </div>
  )
}

function StatCard({
  label, value, icon, color, bg, border, pulse
}: {
  label: string; value: number; icon: React.ReactNode
  color: string; bg: string; border: string; pulse?: boolean
}) {
  return (
    <div className={cn('rounded-xl p-4 flex items-center gap-4 border bg-neutral-900', border, pulse && 'ring-1 ring-red-500/30')}>
      <div className={cn('w-11 h-11 rounded-lg flex items-center justify-center shrink-0', bg, color)}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-black text-white tabular-nums">{value}</div>
        <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-[0.15em]">{label}</div>
      </div>
    </div>
  )
}

function DiscrepancyRow({ row, onClick }: { row: Discrepancy; onClick: () => void }) {
  const delta = row.shipped_qty - row.expected_qty

  return (
    <tr
      onClick={onClick}
      className="hover:bg-neutral-800/50 cursor-pointer transition-colors group"
    >
      <td className="px-4 py-3">
        <span className={cn('badge text-[10px]', PRIORITY_COLORS[row.priority])}>
          <span className={cn('w-1.5 h-1.5 rounded-full', {
            'bg-red-500': row.priority === 'critical',
            'bg-amber-500': row.priority === 'high',
            'bg-blue-500': row.priority === 'medium',
            'bg-neutral-500': row.priority === 'low',
          })} />
          {PRIORITY_LABELS[row.priority]}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-neutral-300">{row.order_number}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          <span className="font-mono text-xs text-white font-medium">{row.sku}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          <span className="font-mono text-xs text-lime-400 font-medium">{row.bin_location}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-neutral-300">{TYPE_LABELS[row.discrepancy_type]}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <ArrowUpDown className="w-3 h-3 text-neutral-600" />
          <span className={cn('font-mono text-xs font-bold', delta < 0 ? 'text-red-400' : delta > 0 ? 'text-amber-400' : 'text-neutral-400')}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
          <span className="text-xs text-neutral-600">({row.expected_qty}/{row.shipped_qty})</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn('badge text-[10px]', STATUS_COLORS[row.status])}>
          {STATUS_LABELS[row.status]}
        </span>
      </td>
      <td className="px-4 py-3">
        {row.assigned_name ? (
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-neutral-600" />
            <span className="text-xs text-neutral-300">{row.assigned_name}</span>
          </div>
        ) : (
          <span className="text-xs text-neutral-700">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">{fmtDelta(row.created_at)}</td>
      <td className="px-4 py-3">
        <ChevronRight className="w-4 h-4 text-neutral-700 group-hover:text-lime-500 transition-colors" />
      </td>
    </tr>
  )
}
