'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { TYPE_LABELS } from '@/lib/utils'

const defaultForm = {
  order_number: '',
  sku: '',
  bin_location: '',
  expected_qty: '',
  shipped_qty: '',
  discrepancy_type: 'short_shipped',
  priority: 'medium',
  source: '',
}

export default function NewDiscrepancyModal({
  onClose, onCreated
}: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    const { order_number, sku, bin_location, expected_qty, shipped_qty } = form
    if (!order_number || !sku || !bin_location || !expected_qty || !shipped_qty) {
      setError('All required fields must be filled.')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/discrepancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        expected_qty: parseInt(expected_qty),
        shipped_qty: parseInt(shipped_qty),
        actor: 'Warehouse Operator',
      }),
    })
    if (res.ok) {
      onCreated()
    } else {
      setError('Failed to log issue.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111111] border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="font-bold text-white uppercase tracking-wide text-sm">Log New Discrepancy</h2>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-semibold">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Order Number *">
              <input className="input w-full" placeholder="ORD-10001" value={form.order_number} onChange={field('order_number')} />
            </Field>
            <Field label="SKU *">
              <input className="input w-full" placeholder="SKU-0000" value={form.sku} onChange={field('sku')} />
            </Field>
            <Field label="Bin Location *">
              <input className="input w-full" placeholder="A-01-01" value={form.bin_location} onChange={field('bin_location')} />
            </Field>
            <Field label="Source">
              <input className="input w-full" placeholder="ShipStation, WMS..." value={form.source} onChange={field('source')} />
            </Field>
            <Field label="Expected Qty *">
              <input className="input w-full" type="number" min="0" value={form.expected_qty} onChange={field('expected_qty')} />
            </Field>
            <Field label="Shipped Qty *">
              <input className="input w-full" type="number" min="0" value={form.shipped_qty} onChange={field('shipped_qty')} />
            </Field>
            <Field label="Discrepancy Type">
              <select className="select w-full" value={form.discrepancy_type} onChange={field('discrepancy_type')}>
                {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map(k => (
                  <option key={k} value={k}>{TYPE_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className="select w-full" value={form.priority} onChange={field('priority')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={submit} disabled={submitting} className="btn-primary">
              <Plus className="w-4 h-4" />
              {submitting ? 'Logging...' : 'Log Issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em]">{label}</label>
      {children}
    </div>
  )
}
