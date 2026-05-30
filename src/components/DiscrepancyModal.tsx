'use client'

import { useState, useEffect } from 'react'
import {
  X, Package, MapPin, Send,
  CheckCircle2, ArrowUp, MessageSquare
} from 'lucide-react'
import { cn, TYPE_LABELS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, fmtDelta } from '@/lib/utils'
import type { Discrepancy, Note, AuditEntry } from '@/lib/db'

interface ModalData {
  disc: Discrepancy & { assigned_name: string | null }
  notes: Note[]
  audit: AuditEntry[]
  users: { id: number; name: string; role: string }[]
}

const ACTOR = 'Warehouse Operator'

export default function DiscrepancyModal({
  id, onClose, onUpdate
}: { id: number; onClose: () => void; onUpdate: () => void }) {
  const [data, setData] = useState<ModalData | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'details' | 'notes' | 'audit'>('details')

  const load = async () => {
    const res = await fetch(`/api/discrepancies/${id}`)
    setData(await res.json())
  }

  useEffect(() => { load() }, [id])

  const patchField = async (field: string, value: unknown) => {
    await fetch(`/api/discrepancies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value, actor: ACTOR }),
    })
    await load()
    onUpdate()
  }

  const submitNote = async () => {
    if (!noteBody.trim()) return
    setSubmitting(true)
    await fetch(`/api/discrepancies/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name: ACTOR, body: noteBody }),
    })
    setNoteBody('')
    await load()
    setSubmitting(false)
  }

  if (!data) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-center h-64 text-neutral-500 text-sm">Loading...</div>
      </ModalShell>
    )
  }

  const { disc, notes, audit, users } = data
  const delta = disc.shipped_qty - disc.expected_qty

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-neutral-400">{disc.order_number}</span>
            <span className={cn('badge text-[10px]', STATUS_COLORS[disc.status])}>{STATUS_LABELS[disc.status]}</span>
            <span className={cn('badge text-[10px]', PRIORITY_COLORS[disc.priority])}>{PRIORITY_LABELS[disc.priority]}</span>
          </div>
          <div className="flex items-center gap-2 text-white font-bold">
            <Package className="w-4 h-4 text-lime-500" />
            {disc.sku}
            <span className="text-neutral-600">·</span>
            <MapPin className="w-4 h-4 text-lime-500" />
            <span className="font-mono text-lime-400">{disc.bin_location}</span>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick actions bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-neutral-900/50 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest whitespace-nowrap">Status</label>
          <select
            value={disc.status}
            onChange={e => patchField('status', e.target.value)}
            className="select text-xs py-1.5 px-2 h-7"
          >
            {(['open','in_review','escalated','resolved'] as const).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest whitespace-nowrap">Priority</label>
          <select
            value={disc.priority}
            onChange={e => patchField('priority', e.target.value)}
            className="select text-xs py-1.5 px-2 h-7"
          >
            {(['low','medium','high','critical'] as const).map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest whitespace-nowrap">Assigned</label>
          <select
            value={disc.assigned_to ?? ''}
            onChange={e => patchField('assigned_to', e.target.value ? parseInt(e.target.value) : null)}
            className="select text-xs py-1.5 px-2 h-7"
          >
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          {disc.status !== 'resolved' && (
            <button
              onClick={() => patchField('status', 'resolved')}
              className="btn text-xs py-1.5 px-3 bg-lime-500/10 text-lime-400 border border-lime-500/20 hover:bg-lime-500/20"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
            </button>
          )}
          {disc.status !== 'escalated' && disc.status !== 'resolved' && (
            <button
              onClick={() => patchField('status', 'escalated')}
              className="btn text-xs py-1.5 px-3 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
            >
              <ArrowUp className="w-3.5 h-3.5" /> Escalate
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 px-6">
        {([
          { key: 'details', label: 'Details' },
          { key: 'notes', label: `Notes (${notes.length})` },
          { key: 'audit', label: 'Audit Log' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors uppercase tracking-wide text-xs',
              tab === key
                ? 'border-lime-500 text-lime-400'
                : 'border-transparent text-neutral-500 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'details' && (
          <div className="grid grid-cols-2 gap-6">
            <DetailGroup title="Shipment">
              <DetailRow label="Order" value={disc.order_number} mono />
              <DetailRow label="SKU" value={disc.sku} mono />
              <DetailRow label="Source" value={disc.source ?? '—'} />
            </DetailGroup>
            <DetailGroup title="Inventory">
              <DetailRow label="Bin Location" value={disc.bin_location} mono highlight />
              <DetailRow label="Expected Qty" value={String(disc.expected_qty)} mono />
              <DetailRow label="Shipped Qty" value={String(disc.shipped_qty)} mono />
              <DetailRow
                label="Discrepancy"
                value={`${delta > 0 ? '+' : ''}${delta} units`}
                mono
                color={delta < 0 ? 'text-red-400' : delta > 0 ? 'text-amber-400' : 'text-lime-400'}
              />
            </DetailGroup>
            <DetailGroup title="Classification" className="col-span-2">
              <DetailRow label="Type" value={TYPE_LABELS[disc.discrepancy_type]} />
              <DetailRow label="Priority" value={PRIORITY_LABELS[disc.priority]} />
              <DetailRow label="Status" value={STATUS_LABELS[disc.status]} />
              {disc.assigned_name && <DetailRow label="Assigned To" value={disc.assigned_name} />}
              <DetailRow label="Flagged" value={fmtDelta(disc.created_at)} />
              {disc.resolved_at && <DetailRow label="Resolved" value={fmtDelta(disc.resolved_at)} />}
            </DetailGroup>

            <div className="col-span-2 card p-4 bg-neutral-900/50">
              <p className="text-[10px] text-neutral-500 mb-3 font-bold uppercase tracking-[0.2em]">Quantity Comparison</p>
              <div className="flex items-end gap-6">
                <QtyBar label="Expected" value={disc.expected_qty} max={Math.max(disc.expected_qty, disc.shipped_qty)} color="bg-lime-500" />
                <QtyBar label="Shipped" value={disc.shipped_qty} max={Math.max(disc.expected_qty, disc.shipped_qty)} color={delta < 0 ? 'bg-red-500' : delta > 0 ? 'bg-amber-500' : 'bg-lime-500'} />
              </div>
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="flex flex-col gap-4">
            {notes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
                <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No notes yet. Add one below.</p>
              </div>
            )}
            {notes.map(note => (
              <div key={note.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-lime-500/20 flex items-center justify-center text-xs font-bold text-lime-400">
                    {note.author_name[0]}
                  </div>
                  <span className="text-sm font-semibold text-white">{note.author_name}</span>
                  <span className="text-xs text-neutral-500 ml-auto">{fmtDelta(note.created_at)}</span>
                </div>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">{note.body}</p>
              </div>
            ))}

            <div className="card p-4 mt-2 bg-neutral-900/50">
              <textarea
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                placeholder="Add a note... describe what you found at the bin, steps taken, or next actions needed."
                className="input w-full min-h-[100px] resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote() }}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-neutral-500">Cmd+Enter to submit</span>
                <button
                  onClick={submitNote}
                  disabled={!noteBody.trim() || submitting}
                  className="btn-primary text-xs"
                >
                  <Send className="w-3.5 h-3.5" /> Add Note
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="flex flex-col gap-2">
            {audit.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-12">No audit history yet.</p>
            )}
            {audit.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-neutral-800 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-lime-500 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-300">
                    <span className="font-semibold text-white">{entry.actor_name}</span>
                    {' '}
                    {formatAuditAction(entry)}
                  </div>
                </div>
                <span className="text-xs text-neutral-500 whitespace-nowrap">{fmtDelta(entry.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function formatAuditAction(entry: AuditEntry) {
  switch (entry.action) {
    case 'status_change':      return `changed status from "${entry.from_value}" to "${entry.to_value}"`
    case 'priority_change':    return `changed priority from "${entry.from_value}" to "${entry.to_value}"`
    case 'assigned_to_change': return `reassigned to user ${entry.to_value}`
    case 'note_added':         return 'added a note'
    case 'created':            return `logged discrepancy (${entry.to_value})`
    default:                   return entry.action
  }
}

function QtyBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex flex-col items-center gap-2 w-24">
      <div className="text-xl font-black tabular-nums text-white">{value}</div>
      <div className="w-full h-24 bg-neutral-800 rounded-lg overflow-hidden flex items-end">
        <div className={cn('w-full rounded-lg transition-all', color)} style={{ height: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{label}</div>
    </div>
  )
}

function DetailGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-3">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function DetailRow({ label, value, mono, highlight, color }: {
  label: string; value: string; mono?: boolean; highlight?: boolean; color?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-neutral-500 shrink-0">{label}</span>
      <span className={cn('text-sm text-right', mono && 'font-mono', highlight && 'text-lime-400 font-semibold', color ?? 'text-white')}>
        {value}
      </span>
    </div>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111111] border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {children}
      </div>
    </div>
  )
}
