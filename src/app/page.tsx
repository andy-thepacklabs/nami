'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, CheckCircle2, Clock, TrendingUp, Search,
  Filter, RefreshCw, Plus, ChevronRight, Bell, BarChart2,
  Package, MapPin, User, ArrowUpDown, Zap, Database, ClipboardCheck, X,
  Compass, Anchor, FileSpreadsheet, Settings, Shield, ShoppingCart
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
import ReorderPanel from '@/components/ReorderPanel'
import HomePanel from '@/components/HomePanel'
import WohTable from '@/components/WohTable'
import AssistantChat from '@/components/AssistantChat'
import EcomRestockPanel from '@/components/EcomRestockPanel'
import InventoryOpsPanel from '@/components/InventoryOpsPanel'
import OpenPoPanel from '@/components/OpenPoPanel'
import ShippedSalesPanel from '@/components/ShippedSalesPanel'
import ShippedSalesByProductPanel from '@/components/ShippedSalesByProductPanel'
import ShippedSalesByStatePanel from '@/components/ShippedSalesByStatePanel'

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

interface WohRow { product_id: string; product_name: string | null; qoh: number; available: number; consumed_90d: number | null; sales_90d?: number | null }
// keep alias for backwards compat in JSX below
type SleeveRow = WohRow

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'splash' | 'home' | 'dashboard' | 'reconcile' | 'cyclecount' | 'finalereport' | 'ecomrestock' | 'openpo' | 'sales'>('home')
  const [wohTab, setWohTab] = useState<'sleeve' | 'display' | 'mylar' | 'tube' | 'cone' | 'label' | 'grinder' | 'lab' | 'marketing' | 'insert' | null>(null)
  const [dashSub, setDashSub] = useState<'woh' | 'reorder' | 'invops'>('woh')
  const [salesSub, setSalesSub] = useState<'shippedsales' | 'shippedsalesbyproduct' | 'shippedsalesbystate'>('shippedsales')
  const [labelRows, setLabelRows] = useState<WohRow[]>([])
  const [labelLoading, setLabelLoading] = useState(false)
  const [labelSearch, setLabelSearch] = useState('')
  const [grinderRows, setGrinderRows] = useState<WohRow[]>([])
  const [grinderLoading, setGrinderLoading] = useState(false)
  const [labRows, setLabRows] = useState<WohRow[]>([])
  const [labLoading, setLabLoading] = useState(false)
  const [marketingRows, setMarketingRows] = useState<WohRow[]>([])
  const [marketingLoading, setMarketingLoading] = useState(false)
  const [insertRows, setInsertRows] = useState<WohRow[]>([])
  const [insertLoading, setInsertLoading] = useState(false)
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

  // Clear all cached WoH rows after Finale sync so they re-fetch with fresh data
  useEffect(() => {
    const clear = () => {
      setSleeveRows([]); setDisplayRows([]); setMylarRows([]); setTubeRows([])
      setConeRows([]); setLabelRows([]); setGrinderRows([]); setLabRows([]); setMarketingRows([]); setInsertRows([])
    }
    window.addEventListener('finale-synced', clear)
    return () => window.removeEventListener('finale-synced', clear)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-black flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nami-bg.png" alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-30" />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Compass className="w-8 h-8 animate-spin text-orange-500" />
          <span className="text-sm font-black tracking-[0.3em] uppercase text-orange-400">Charting course...</span>
        </div>
      </div>
    )
  }

  const { stats, byType, recentActivity, hotBins } = statsData!

  const SideNavItem = ({ tab, icon, label }: { tab: typeof activeTab; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors text-left',
        activeTab === tab
          ? 'bg-orange-500/15 text-orange-400'
          : 'text-white/50 hover:bg-white/5 hover:text-white'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )

  return (
    <div className="h-screen flex bg-black overflow-hidden">
      <AssistantChat />

      {/* ── Left sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col bg-gradient-to-b from-[#0d0a07] to-[#09090b] border-r border-orange-900/30 z-30">
        {/* Logo */}
        <div className="px-4 py-8 border-b border-orange-900/30 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://thepacklabs.com/wp-content/uploads/2025/03/packlogo.png"
            alt="The Pack Labs"
            className="h-14 w-auto"
          />
          <div className="w-px h-10 bg-orange-900/40" />
          <button
            onClick={() => setActiveTab('splash')}
            className="text-2xl font-black text-orange-400 tracking-tight uppercase hover:text-orange-300 transition-colors"
          >
            Nami
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-12 space-y-1 overflow-y-auto">
          <SideNavItem tab="home"        icon={<BarChart2 className="w-4 h-4 shrink-0" />}       label="Dashboard" />
          <SideNavItem tab="dashboard"   icon={<Package className="w-4 h-4 shrink-0" />}         label="Inventory" />
          <SideNavItem tab="reconcile"   icon={<ClipboardCheck className="w-4 h-4 shrink-0" />}  label="Reconcile" />
          <div className="pt-2 border-t border-white/10 space-y-1 mt-2">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-white/20 cursor-not-allowed" disabled>
              <ShoppingCart className="w-4 h-4 shrink-0" /><span>Purchasing</span>
            </button>
            <SideNavItem tab="sales" icon={<TrendingUp className="w-4 h-4 shrink-0" />} label="Sales" />
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-white/20 cursor-not-allowed" disabled>
              <Bell className="w-4 h-4 shrink-0" /><span>Alerts</span>
            </button>
          </div>
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-orange-900/30 space-y-1">
          <button onClick={() => setShowSettings(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-white/50 hover:bg-white/5 hover:text-white transition-colors">
            <Settings className="w-4 h-4 shrink-0" /><span>Settings</span>
          </button>
        </div>
      </aside>

      {/* ── Right main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="h-14 border-b border-orange-900/30 bg-[#0d0a07] flex items-center px-5 gap-3 shrink-0 z-20">
          <div className="flex-1" />
          <button onClick={() => setActiveTab('finalereport')} className="btn text-sm bg-white/5 text-white/70 border border-white/10 hover:bg-white/10">
            <FileSpreadsheet className="w-4 h-4" /> Finale Report
          </button>
          <button onClick={() => setShowSheets(true)} className="btn text-sm bg-orange-600/20 text-white border border-orange-600/30 hover:bg-orange-600/30">
            <FileSpreadsheet className="w-4 h-4" /> Daily Cycle Count
          </button>
          <button onClick={() => setShowReport(true)} className="btn-ghost text-sm">
            <BarChart2 className="w-4 h-4" /> Report
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Log Issue
          </button>
          <button onClick={() => refresh()} disabled={refreshing} className="btn-ghost w-10 h-10 p-0 justify-center rounded-lg" title="Refresh">
            <RefreshCw className={cn('w-5 h-5', refreshing && 'animate-spin')} />
          </button>
        </header>

      {activeTab === 'splash' ? (
        <div
          className="flex-1 bg-black flex items-center justify-center cursor-pointer"
          style={{ minHeight: 0 }}
          onClick={() => setActiveTab('home')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nami-bg.png"
            alt="Nami"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        </div>
      ) : activeTab === 'reconcile' ? (
        <ReconcileTab />
      ) : activeTab === 'cyclecount' ? (
        <CycleCountPanel onClose={() => setActiveTab('dashboard')} inline />
      ) : activeTab === 'finalereport' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <FinaleReportPanel onClose={() => setActiveTab('dashboard')} />
        </div>
      ) : activeTab === 'openpo' ? (
        <OpenPoPanel />
      ) : activeTab === 'sales' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sales sub-tabs */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
            <button
              onClick={() => setSalesSub('shippedsales')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
                salesSub === 'shippedsales' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <TrendingUp className="w-4 h-4" />Shipped Sales
            </button>
            <button
              onClick={() => setSalesSub('shippedsalesbyproduct')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
                salesSub === 'shippedsalesbyproduct' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <Package className="w-4 h-4" />Shipped Sales by Product
            </button>
            <button
              onClick={() => setSalesSub('shippedsalesbystate')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
                salesSub === 'shippedsalesbystate' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <MapPin className="w-4 h-4" />Shipped Sales by State
            </button>
          </div>
          {salesSub === 'shippedsales' && <ShippedSalesPanel />}
          {salesSub === 'shippedsalesbyproduct' && <ShippedSalesByProductPanel />}
          {salesSub === 'shippedsalesbystate' && <ShippedSalesByStatePanel />}
        </div>
      ) : activeTab === 'ecomrestock' ? (
        <EcomRestockPanel />
      ) : activeTab === 'home' ? (
        <HomePanel onOpenPoClick={() => setActiveTab('openpo')} />
      ) : (
        /* ── Dashboard tab ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dashboard sub-tabs */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
            <button
              onClick={() => setDashSub('woh')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
                dashSub === 'woh' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <BarChart2 className="w-4 h-4" />Week On Hand
            </button>
            <button
              onClick={() => setDashSub('reorder')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
                dashSub === 'reorder' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <AlertTriangle className="w-4 h-4" />Reorder Recommendations
            </button>
            <button
              onClick={() => setDashSub('invops')}
              className={cn('flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors',
                dashSub === 'invops' ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30' : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              <Package className="w-4 h-4" />Inventory Operation
            </button>
          </div>

          {/* Sub-tab content */}
          {dashSub === 'reorder' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <ReorderPanel />
            </div>
          ) : dashSub === 'invops' ? (
            <InventoryOpsPanel />
          ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left — Raw Materials panel */}
            <div className="w-56 shrink-0 border-r border-orange-900/30 flex flex-col bg-black">
              <div className="px-4 py-3 border-b border-orange-900/30">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Raw Materials</h3>
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
                    wohTab === 'sleeve' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Sleeve</span>
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
                    wohTab === 'display' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Display</span>
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
                    wohTab === 'mylar' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Mylar</span>
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
                    wohTab === 'tube' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Tube</span>
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
                    wohTab === 'cone' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Cone</span>
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
                    wohTab === 'label' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Label</span>
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
                    wohTab === 'grinder' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Grinder</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('lab')
                    if (labRows.length === 0) {
                      setLabLoading(true)
                      fetch('/api/woh/lab').then(r => r.json()).then(d => { setLabRows(d.rows || []); setLabLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'lab' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Lab</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('marketing')
                    if (marketingRows.length === 0) {
                      setMarketingLoading(true)
                      fetch('/api/woh/marketing').then(r => r.json()).then(d => { setMarketingRows(d.rows || []); setMarketingLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'marketing' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Marketing</span>
                </button>
                <button
                  onClick={() => {
                    setWohTab('insert')
                    if (insertRows.length === 0) {
                      setInsertLoading(true)
                      fetch('/api/woh/insert').then(r => r.json()).then(d => { setInsertRows(d.rows || []); setInsertLoading(false) })
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
                    wohTab === 'insert' ? 'bg-orange-500/15 text-orange-400' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="text-sm font-bold uppercase tracking-wider">Insert</span>
                </button>
              </div>
            </div>

            {/* Right — table area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Shared search bar */}
              {wohTab && (
                <div className="px-6 py-2.5 border-b border-orange-900/20 bg-black shrink-0 flex items-center gap-3">
                  <Search className="w-3.5 h-3.5 text-orange-700 shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-sm text-orange-200 placeholder-orange-900 outline-none"
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
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Sleeve</span>
                    {!sleeveLoading && <span className="text-xs text-white/30">{sleeveRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={sleeveRows} loading={sleeveLoading} search={wohSearch} emptyMessage="No SLV items found. Sync Finale first." />
                  </div>
                </>
              ) : wohTab === 'display' ? (
                <>
                  <div className="px-6 py-3 border-b border-orange-900/30 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Display</span>
                    {!displayLoading && <span className="text-xs text-white/30">{displayRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={displayRows} loading={displayLoading} search={wohSearch} emptyMessage="No display data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'mylar' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Mylar</span>
                    {!mylarLoading && <span className="text-xs text-white/30">{mylarRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={mylarRows} loading={mylarLoading} search={wohSearch} emptyMessage="No mylar data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'tube' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Tube</span>
                    {!tubeLoading && <span className="text-xs text-white/30">{tubeRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={tubeRows} loading={tubeLoading} search={wohSearch} emptyMessage="No tube data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'cone' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Cone</span>
                    {!coneLoading && <span className="text-xs text-white/30">{coneRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={coneRows} loading={coneLoading} search={wohSearch} emptyMessage="No cone data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'label' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Label</span>
                    {!labelLoading && <span className="text-xs text-white/30">{labelRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={labelRows} loading={labelLoading} search={wohSearch} emptyMessage="No label data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'grinder' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Grinder</span>
                    {!grinderLoading && <span className="text-xs text-white/30">{grinderRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={grinderRows} loading={grinderLoading} search={wohSearch} emptyMessage="No grinder data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'lab' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Lab</span>
                    {!labLoading && <span className="text-xs text-white/30">{labRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={labRows} loading={labLoading} search={wohSearch} emptyMessage="No lab data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'marketing' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Marketing</span>
                    {!marketingLoading && <span className="text-xs text-white/30">{marketingRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={marketingRows} loading={marketingLoading} search={wohSearch} showSale useSaleForMonthly emptyMessage="No marketing data — sync from Finale first." />
                  </div>
                </>
              ) : wohTab === 'insert' ? (
                <>
                  <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-white/80">Insert</span>
                    {!insertLoading && <span className="text-xs text-white/30">{insertRows.length} SKUs</span>}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <WohTable rows={insertRows} loading={insertLoading} search={wohSearch} emptyMessage="No insert data — sync from Finale first." />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-orange-900">
                  Select a category from the left.
                </div>
              )}
            </div>
          </div>
          )}
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
