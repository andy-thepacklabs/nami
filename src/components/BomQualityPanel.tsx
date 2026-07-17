'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProductRow {
  product_id:      string
  product_name:    string
  status_id:       string
  expand_policy:   string
  bom_child_count: number
}

interface IssueGroup {
  count: number
  rows:  ProductRow[]
}

interface AnalysisData {
  synced:  boolean
  summary: {
    total:          number
    expand_count:   number
    noexpand_count: number
    blank_count:    number
    has_bom_count:  number
  } | null
  healthy: {
    expandWithBom:  number
    noexpandNoBom:  number
  }
  issues: {
    expandNoBom:     IssueGroup
    noexpandWithBom: IssueGroup
    blankWithBom:    IssueGroup
  }
}

interface SyncState {
  status:   string
  progress: string
  count:    number
  error:    string | null
  syncedAt: string | null
  summary:  { expand: number; noexpand: number; blank: number; total: number } | null
}

function policyBadge(policy: string) {
  if (policy === '##expand')   return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/30 text-blue-400">##expand</span>
  if (policy === '##noexpand') return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-900/30 text-orange-400">##noexpand</span>
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-white/30">blank</span>
}

function statusBadge(s: string) {
  const active = s === 'PRODUCT_ACTIVE'
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
      active ? 'bg-green-900/30 text-green-400' : 'bg-white/5 text-white/30')}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function IssueTable({ rows }: { rows: ProductRow[] }) {
  return (
    <table className="w-full text-sm mt-2">
      <thead>
        <tr className="border-b border-orange-900/20">
          <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-orange-700">Product ID</th>
          <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-orange-700">Name</th>
          <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-orange-700">Status</th>
          <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-orange-700">Policy</th>
          <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-widest text-orange-700">BOM Children</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.product_id} className="border-b border-orange-900/10 hover:bg-orange-950/20 transition-colors">
            <td className="px-4 py-2 font-mono text-xs text-orange-300/70">{row.product_id}</td>
            <td className="px-4 py-2 text-xs text-white/70 max-w-xs truncate" title={row.product_name}>{row.product_name || '—'}</td>
            <td className="px-4 py-2">{statusBadge(row.status_id)}</td>
            <td className="px-4 py-2">{policyBadge(row.expand_policy)}</td>
            <td className="px-4 py-2 text-right tabular-nums text-xs text-white/60">{row.bom_child_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface CollapsibleIssueProps {
  icon:    React.ReactNode
  title:   string
  badge:   string
  color:   string
  desc:    string
  rows:    ProductRow[]
  defaultOpen?: boolean
}

function CollapsibleIssue({ icon, title, badge, color, desc, rows, defaultOpen }: CollapsibleIssueProps) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="border border-orange-900/20 rounded-lg overflow-hidden mb-4">
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-orange-950/20 transition-colors"
      >
        <span className={color}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white/90">{title}</span>
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-black tabular-nums', color.includes('red') ? 'bg-red-900/30 text-red-400' : color.includes('yellow') ? 'bg-yellow-900/30 text-yellow-400' : 'bg-orange-900/30 text-orange-400')}>{badge}</span>
          </div>
          <div className="text-xs text-white/40 mt-0.5">{desc}</div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-orange-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-orange-600 shrink-0" />}
      </div>
      {open && rows.length > 0 && (
        <div className="border-t border-orange-900/20 overflow-x-auto max-h-96 overflow-y-auto">
          <IssueTable rows={rows} />
        </div>
      )}
      {open && rows.length === 0 && (
        <div className="border-t border-orange-900/20 px-5 py-4 text-xs text-white/30 text-center">No issues found.</div>
      )}
    </div>
  )
}

export default function BomQualityPanel() {
  const [data, setData]       = useState<AnalysisData | null>(null)
  const [syncSt, setSyncSt]   = useState<SyncState | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [loaded, setLoaded]   = useState(false)

  useEffect(() => {
    if (!loaded) {
      fetch('/api/bom-analysis').then(r => r.json()).then(d => { setData(d); setLoaded(true) })
      fetch('/api/bom-sync').then(r => r.json()).then(setSyncSt)
    }
  }, [loaded])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('Starting sync from Finale…')
    try {
      await fetch('/api/bom-sync', { method: 'POST' })
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const s: SyncState = await fetch('/api/bom-sync').then(r => r.json())
        setSyncSt(s)
        setSyncMsg(s.progress || s.status)
        if (s.status === 'done') {
          setSyncMsg(`Done — ${s.count.toLocaleString()} products synced`)
          setLoaded(false)
          break
        }
        if (s.status === 'error') {
          setSyncMsg(`Error: ${s.error}`)
          break
        }
      }
    } catch (e) {
      setSyncMsg(`Error: ${e}`)
    } finally {
      setSyncing(false)
    }
  }

  const s = data?.summary

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-orange-900/30 bg-black shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-orange-700">BOM Quality Check</span>
        <div className="flex-1" />
        {syncMsg && <span className="text-xs text-orange-400/70 max-w-sm truncate" title={syncMsg}>{syncMsg}</span>}
        {syncSt?.syncedAt && !syncMsg && (
          <span className="text-xs text-white/20">Last sync: {new Date(syncSt.syncedAt).toLocaleString()}</span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30 hover:bg-orange-500/25 disabled:opacity-50 transition-colors"
        >
          {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync from Finale
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">

        {!data?.synced && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <HelpCircle className="w-12 h-12 text-orange-900" />
            <p className="text-white/40 text-sm text-center">
              No BOM data synced yet.<br />Click "Sync from Finale" to fetch all products and BOM entries.
            </p>
          </div>
        )}

        {data?.synced && s && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Products', value: s.total.toLocaleString(), color: 'text-white/80' },
                { label: '##expand',       value: s.expand_count.toLocaleString(), color: 'text-blue-400' },
                { label: '##noexpand',     value: s.noexpand_count.toLocaleString(), color: 'text-orange-400' },
                { label: 'Blank Policy',   value: s.blank_count.toLocaleString(), color: 'text-white/40' },
              ].map(c => (
                <div key={c.label} className="bg-white/3 border border-orange-900/20 rounded-lg p-4">
                  <div className="text-xs text-white/30 uppercase tracking-widest mb-1">{c.label}</div>
                  <div className={cn('text-2xl font-black tabular-nums', c.color)}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Health summary */}
            <div className="flex gap-6 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-white/60">{data.healthy.expandWithBom.toLocaleString()} <span className="text-green-400 font-bold">##expand</span> with BOM children (correct)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-white/60">{data.healthy.noexpandNoBom.toLocaleString()} <span className="text-orange-400 font-bold">##noexpand</span> with no children (correct)</span>
              </div>
            </div>

            {/* Issue sections */}
            <div className="mb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-red-700 mb-3">Issues Detected</h3>

              <CollapsibleIssue
                icon={<XCircle className="w-5 h-5" />}
                title="##expand with no BOM children"
                badge={`${data.issues.expandNoBom.count} products`}
                color="text-red-400"
                desc="Policy says 'expand' (deduct components) but no BOM is defined — Finale will silently skip explosion, leaving inventory uncorrected."
                rows={data.issues.expandNoBom.rows}
                defaultOpen={data.issues.expandNoBom.count > 0}
              />

              <CollapsibleIssue
                icon={<AlertTriangle className="w-5 h-5" />}
                title="##noexpand with BOM children"
                badge={`${data.issues.noexpandWithBom.count} products`}
                color="text-yellow-400"
                desc="BOM is defined but policy says 'don't expand' — components are never deducted. Intentional bundles should stay ##noexpand; accidental ones need review."
                rows={data.issues.noexpandWithBom.rows}
                defaultOpen={data.issues.noexpandWithBom.count > 0}
              />

              <CollapsibleIssue
                icon={<HelpCircle className="w-5 h-5" />}
                title="Blank policy with BOM children"
                badge={`${data.issues.blankWithBom.count} products`}
                color="text-orange-400"
                desc="No expand policy set, but BOM children exist. These are silent sub-assemblies — Finale's behavior depends on its default, which may not explode the BOM."
                rows={data.issues.blankWithBom.rows}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
