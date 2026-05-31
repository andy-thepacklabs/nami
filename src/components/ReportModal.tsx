'use client'

import { useState, useEffect } from 'react'
import { X, BarChart2, Package, MapPin, AlertTriangle } from 'lucide-react'
import { cn, TYPE_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils'
import type { Discrepancy } from '@/lib/db'

interface ReportData {
  date: string
  opened_today: number
  resolved_today: number
  open_by_priority: { priority: string; count: number }[]
  open_by_type: { type: string; count: number }[]
  top_skus: { sku: string; count: number }[]
  top_bins: { bin: string; count: number }[]
  unresolved_critical: (Discrepancy & { assigned_name: string | null })[]
}

export default function ReportModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null)

  useEffect(() => {
    fetch('/api/report').then(r => r.json()).then(setData)
  }, [])

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl w-full max-w-2xl p-8 text-center text-slate-500 text-sm">
          Loading report...
        </div>
      </div>
    )
  }

  const maxPriCount = Math.max(...data.open_by_priority.map(x => x.count), 1)
  const maxTypeCount = Math.max(...data.open_by_type.map(x => x.count), 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-[#1e2433] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2433]">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-orange-500" />
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Daily Discrepancy Report</h2>
            <span className="text-xs text-slate-500 font-mono">{data.date}</span>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 text-center">
              <div className="text-3xl font-black text-amber-400 tabular-nums">{data.opened_today}</div>
              <div className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-[0.2em]">Opened Today</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-3xl font-black text-orange-400 tabular-nums">{data.resolved_today}</div>
              <div className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-[0.2em]">Resolved Today</div>
            </div>
          </div>

          {/* By priority */}
          <div className="card p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Open by Priority</p>
            <div className="flex flex-col gap-3">
              {data.open_by_priority.map(({ priority, count }) => (
                <div key={priority} className="flex items-center gap-3">
                  <span className={cn('badge w-20 justify-center text-[10px]', PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS])}>
                    {PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority}
                  </span>
                  <div className="flex-1 bg-[#1a1f2e] rounded-full h-2">
                    <div
                      className={cn('h-2 rounded-full transition-all', {
                        'bg-red-500': priority === 'critical',
                        'bg-amber-500': priority === 'high',
                        'bg-blue-500': priority === 'medium',
                        'bg-neutral-500': priority === 'low',
                      })}
                      style={{ width: `${(count / maxPriCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums text-white w-6 text-right">{count}</span>
                </div>
              ))}
              {data.open_by_priority.length === 0 && <p className="text-sm text-slate-500">No open issues.</p>}
            </div>
          </div>

          {/* By type */}
          <div className="card p-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Open by Type</p>
            <div className="flex flex-col gap-3">
              {data.open_by_type.map(({ type, count }) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-36 truncate shrink-0">
                    {TYPE_LABELS[type as keyof typeof TYPE_LABELS] ?? type}
                  </span>
                  <div className="flex-1 bg-[#1a1f2e] rounded-full h-2">
                    <div className="h-2 rounded-full bg-orange-500" style={{ width: `${(count / maxTypeCount) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold tabular-nums text-white w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top SKUs + Bins */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Top SKUs
              </p>
              {data.top_skus.slice(0, 5).map(({ sku, count }) => (
                <div key={sku} className="flex items-center justify-between py-1.5">
                  <span className="font-mono text-xs text-white font-medium">{sku}</span>
                  <span className="text-xs text-slate-500 tabular-nums font-mono">{count}</span>
                </div>
              ))}
              {data.top_skus.length === 0 && <p className="text-xs text-slate-700">None</p>}
            </div>
            <div className="card p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Hot Bins
              </p>
              {data.top_bins.slice(0, 5).map(({ bin, count }) => (
                <div key={bin} className="flex items-center justify-between py-1.5">
                  <span className="font-mono text-xs text-orange-400 font-medium">{bin}</span>
                  <span className="text-xs text-slate-500 tabular-nums font-mono">{count}</span>
                </div>
              ))}
              {data.top_bins.length === 0 && <p className="text-xs text-slate-700">None</p>}
            </div>
          </div>

          {/* Critical unresolved */}
          {data.unresolved_critical.length > 0 && (
            <div className="card p-4 border-red-500/20">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Unresolved Critical
              </p>
              <div className="flex flex-col gap-2">
                {data.unresolved_critical.map(d => (
                  <div key={d.id} className="flex items-center gap-3 py-2 border-b border-[#1e2433] last:border-0">
                    <span className="font-mono text-xs text-slate-400">{d.order_number}</span>
                    <span className="font-mono text-xs text-white font-medium">{d.sku}</span>
                    <span className="font-mono text-xs text-orange-400">{d.bin_location}</span>
                    <span className={cn('badge text-[10px] ml-auto', STATUS_COLORS[d.status])}>{STATUS_LABELS[d.status]}</span>
                    {d.assigned_name && <span className="text-xs text-slate-500">{d.assigned_name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
