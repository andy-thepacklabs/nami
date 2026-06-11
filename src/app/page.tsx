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

interface WohRow { product_id: string; product_name: string | null; qoh: number; available: number; consumed_90d: number | null }
// keep alias for backwards compat in JSX below
type SleeveRow = WohRow

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'reconcile' | 'cyclecount' | 'finalereport'>('home')
  const [wohTab, setWohTab] = useState<'sleeve' | 'display' | 'mylar' | 'tube' | 'cone' | 'label' | 'grinder' | null>(null)
  const [labelRows, setLabelRows] = useState<WohRow[]>([])
  const [labelLoading, setLabelLoading] = useState(false)
  const [labelSearch, setLabelSearch] = useState('')
  const [grinderRows, setGrinderRows] = useState<WohRow[]>([])
  const [grinderLoading, setGrinderLoading] = useState(false)
  const [sleeveRows, setSleeveRows] = useState<WohRow[]>([])
  const [sleeveLoading, setSleeveLoading] = useState(false)
  const [displayRows, setDisplayRows] = useState<WohRow[]>([])
  const [displayLoading, setDisplayLoading] = useState(false)
  const [mylarRows, setMylarRows] = useState<WohRow[]>([])
  const [mylarLoading, setMylarLoading] = useState(false)
  const [tubeRows, setTubeRows] = useState<WohRow[]>([])
  const [tubeLoading, setTubeLoading] = useState(false)
  const [coneRows, setConeRows] = useState<WohRow[]>([])
  const [coneLoading, setConeLoading] = useState(false)
  const [wohSearch, setWohSearch] = useState('')
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
    <div className="h-screen flex flex-col bg-[#0a0c10] overflow-hidden">
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
          <FileSpreadsheet className="w-4 h-4" /> Daily Cycle Count
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
        /* ── Pure Home tab: full artwork centered, black background ── */
        <div className="flex-1 bg-[#0a0c10] flex items-center justify-center" style={{ minHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nami-bg.png"
            alt="Nami"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        </div>
      ) : (
        /* ── Dashboard tab ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dashboard sub-tabs */}
          <div className="flex gap-1 px-6 pt-4 border-b border-orange-900/30">
            <button className="px-4 py-2 rounded-t-lg text-xs font-bold uppercase tracking-wide bg-orange-500/15 text-orange-400 border border-orange-900/30 border-b-0 -mb-px">
              Week On Hand
            </button>
          </div>

          {/* Week On Hand content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left — Raw Materials panel */}
            <div className="w-56 shrink-0 border-r border-orange-900/30 flex flex-col bg-[#0d0a07]">
              <div className="px-4 py-3 border-b border-orange-900/30">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700">Raw Materials</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                <button
                  onClick={() => {
                    setWohTab('sleeve')
                    if (sleeveRows.length === 0) {
                      setSleeveLoading(true)
                      fetch('/api/woh/sleeves').then(r => r.json()).then(d => { setSleeveRows(d.rows || []); setSleeveLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'sleeve' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Sleeve</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('display')
                    if (displayRows.length === 0) {
                      setDisplayLoading(true)
                      fetch('/api/woh/display').then(r => r.json()).then(d => { setDisplayRows(d.rows || []); setDisplayLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'display' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Display</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('mylar')
                    if (mylarRows.length === 0) {
                      setMylarLoading(true)
                      fetch('/api/woh/mylar').then(r => r.json()).then(d => { setMylarRows(d.rows || []); setMylarLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'mylar' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Mylar</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('tube')
                    if (tubeRows.length === 0) {
                      setTubeLoading(true)
                      fetch('/api/woh/tube').then(r => r.json()).then(d => { setTubeRows(d.rows || []); setTubeLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'tube' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Tube</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('cone')
                    if (coneRows.length === 0) {
                      setConeLoading(true)
                      fetch('/api/woh/cone').then(r => r.json()).then(d => { setConeRows(d.rows || []); setConeLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'cone' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Cone</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('label')
                    if (labelRows.length === 0) {
                      setLabelLoading(true)
                      fetch('/api/woh/labels').then(r => r.json()).then(d => { setLabelRows(d.rows || []); setLabelLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'label' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Label</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('grinder')
                    if (grinderRows.length === 0) {
                      setGrinderLoading(true)
                      fetch('/api/woh/grinder').then(r => r.json()).then(d => { setGrinderRows(d.rows || []); setGrinderLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'grinder' ? 'bg-orange-500/15 text-orange-400' : 'text-orange-700 hover:bg-orange-500/10 hover:text-orange-400'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Grinder</span>
                </button>
              </div>
            </div>

            {/* Right — table area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Shared search bar */}
              {wohTab && (
                <div className="px-6 py-2.5 border-b border-orange-900/20 bg-[#0d0a07] shrink-0 flex items-center gap-3">
                  <Search className="w-3.5 h-3.5 text-orange-700 shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-xs text-orange-200 placeholder-orange-900 outline-none"
                    placeholder="Search product ID or name..."
                    value={wohSearch}
                    onChange={e => setWohSearch(e.target.value)}
                  />
                  {wohSearch && (
                    <button onClick={() => setWohSearch('')} className="text-orange-800 hover:text-orange-500 text-xs">✕</button>
                  )}
                </div>
              )}
              {wohTab === 'sleeve' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Sleeve</span>
                    {!sleeveLoading && <span className="text-[10px] text-orange-800">{sleeveRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {sleeveLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
                      </div>
                    ) : sleeveRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">
                        No SLV items found. Sync Finale Report first.
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? sleeveRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : sleeveRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0
                              ? row.consumed_90d / 3
                              : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0
                              ? (row.qoh / monthlyRequired) * 4.33
                              : null
                            const wohAvailable = monthlyRequired != null && row.available > 0
                              ? (row.available / monthlyRequired) * 4.33
                              : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : wohTab === 'display' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Display</span>
                    {!displayLoading && <span className="text-[10px] text-orange-800">{displayRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {displayLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...
                      </div>
                    ) : displayRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">No display data — sync from Finale first.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? displayRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : displayRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0
                              ? row.consumed_90d / 3
                              : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0
                              ? (row.qoh / monthlyRequired) * 4.33
                              : null
                            const wohAvailable = monthlyRequired != null && row.available > 0
                              ? (row.available / monthlyRequired) * 4.33
                              : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : wohTab === 'mylar' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Mylar</span>
                    {!mylarLoading && <span className="text-[10px] text-orange-800">{mylarRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {mylarLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...
                      </div>
                    ) : mylarRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">No mylar data — sync from Finale first.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? mylarRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : mylarRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0
                              ? row.consumed_90d / 3
                              : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0
                              ? (row.qoh / monthlyRequired) * 4.33
                              : null
                            const wohAvailable = monthlyRequired != null && row.available > 0
                              ? (row.available / monthlyRequired) * 4.33
                              : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : wohTab === 'tube' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Tube</span>
                    {!tubeLoading && <span className="text-[10px] text-orange-800">{tubeRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {tubeLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...
                      </div>
                    ) : tubeRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">No tube data — sync from Finale first.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? tubeRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : tubeRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0
                              ? row.consumed_90d / 3
                              : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0
                              ? (row.qoh / monthlyRequired) * 4.33
                              : null
                            const wohAvailable = monthlyRequired != null && row.available > 0
                              ? (row.available / monthlyRequired) * 4.33
                              : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : wohTab === 'cone' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Cone</span>
                    {!coneLoading && <span className="text-[10px] text-orange-800">{coneRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {coneLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...
                      </div>
                    ) : coneRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">No cone data — sync from Finale first.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? coneRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : coneRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0
                              ? row.consumed_90d / 3
                              : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0
                              ? (row.qoh / monthlyRequired) * 4.33
                              : null
                            const wohAvailable = monthlyRequired != null && row.available > 0
                              ? (row.available / monthlyRequired) * 4.33
                              : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : wohTab === 'label' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Label</span>
                    {!labelLoading && <span className="text-[10px] text-orange-800">{labelRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {labelLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
                      </div>
                    ) : labelRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">No label data — upload a Finale stock CSV first.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? labelRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : labelRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0 ? row.consumed_90d / 3 : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0 ? (row.qoh / monthlyRequired) * 4.33 : null
                            const wohAvailable = monthlyRequired != null && row.available > 0 ? (row.available / monthlyRequired) * 4.33 : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : wohTab === 'grinder' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-500">Grinder</span>
                    {!grinderLoading && <span className="text-[10px] text-orange-800">{grinderRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    {grinderLoading ? (
                      <div className="flex items-center justify-center h-32 gap-2 text-orange-800 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
                      </div>
                    ) : grinderRows.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-xs text-orange-900">No grinder data — upload a Finale stock CSV first.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d0a07] z-10">
                          <tr className="border-b border-orange-900/30">
                            <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Product ID</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock QoH</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Stock Available</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Consumed 90d</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Monthly Required</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand</th>
                            <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700">Wk On Hand (Total)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-900/20">
                          {(wohSearch ? grinderRows.filter(r => r.product_id.toLowerCase().includes(wohSearch.toLowerCase()) || (r.product_name || '').toLowerCase().includes(wohSearch.toLowerCase())) : grinderRows).map(row => {
                            const monthlyRequired = row.consumed_90d != null && row.consumed_90d > 0 ? row.consumed_90d / 3 : null
                            const wohQoh = monthlyRequired != null && row.qoh > 0 ? (row.qoh / monthlyRequired) * 4.33 : null
                            const wohAvailable = monthlyRequired != null && row.available > 0 ? (row.available / monthlyRequired) * 4.33 : null
                            return (
                              <tr key={row.product_id} className="hover:bg-orange-500/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-mono font-semibold text-orange-300">{row.product_id}</div>
                                  {row.product_name && <div className="text-[10px] text-orange-800 truncate max-w-[200px]">{row.product_name}</div>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white font-bold">{row.qoh.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">{row.available.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-400">
                                  {row.consumed_90d != null ? Math.round(row.consumed_90d).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-300">
                                  {monthlyRequired != null ? Math.round(monthlyRequired).toLocaleString() : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-400">
                                  {wohQoh != null ? wohQoh.toFixed(1) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-sky-300">
                                  {wohAvailable != null ? wohAvailable.toFixed(1) : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-orange-900">
                  Select a category from the left.
                </div>
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
