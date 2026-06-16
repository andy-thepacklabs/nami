'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Package, FileText, Printer, X, Upload, CheckCircle2, Trash2 } from 'lucide-react'

interface RestockRow {
  product_id: string
  product_name: string | null
  qoh: number
  sales_60d: number | null
}

interface DerivedRow extends RestockRow {
  restockPoint: number
  qtyToRestock: number
}

interface BomEntry {
  sku: string
  component: string
  qty: number
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function genTicketNumber() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hhmm = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0')
  return `RST-${yy}${mm}${dd}-${hhmm}`
}

function parseBomCsv(text: string): BomEntry[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const skuIdx = header.findIndex(h => h.includes('sku') || h.includes('product'))
  const compIdx = header.findIndex(h => h.includes('component') || h.includes('material') || h.includes('raw'))
  const qtyIdx = header.findIndex(h => h.includes('qty') || h.includes('quantity'))
  if (skuIdx === -1 || qtyIdx === -1) return []
  return lines.slice(1).flatMap(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const sku = cols[skuIdx]
    const component = compIdx >= 0 ? cols[compIdx] : ''
    const qty = parseFloat(cols[qtyIdx])
    if (!sku || isNaN(qty)) return []
    return [{ sku, component, qty }]
  })
}

function ReportModal({ items, onClose }: { items: DerivedRow[]; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null)
  const [department, setDepartment] = useState('Inventory Control')
  const [name, setName] = useState('Andy Nguyen')
  const [fulfillBy, setFulfillBy] = useState('')
  const [bomEntries, setBomEntries] = useState<BomEntry[]>([])
  const [bomFileName, setBomFileName] = useState<string | null>(null)
  const ticketNumber = useRef(genTicketNumber())
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  function handleBomUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBomFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      setBomEntries(parseBomCsv(ev.target?.result as string))
    }
    reader.readAsText(file)
  }

  function handlePrint() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Restock Ticket ${ticketNumber.current}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; padding: 32px; }
        h1 { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
        .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; padding: 14px 16px; background: #f3f4f6; border-radius: 6px; border: 1px solid #e5e7eb; }
        .meta-item label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 3px; }
        .meta-item span { font-size: 13px; font-weight: 600; color: #111; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #e5e7eb; }
        th.r, td.r { text-align: right; }
        td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        tr:nth-child(even) td { background: #f9fafb; }
        .qty { font-weight: 700; color: #dc2626; }
        .footer { margin-top: 20px; font-size: 10px; color: #999; }
        @media print { body { padding: 16px; } }
      </style>
    </head><body>${content}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '16px' }}>
      <div style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', width: '100%', maxWidth: '900px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: '15px' }}>Restock Report</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '2px' }}>{items.length} items · Ticket {ticketNumber.current}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}>
              <Printer size={13} /> Print / Save PDF
            </button>
            <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body row */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* LEFT — BOM Upload */}
          <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', overflowY: 'auto' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Bill of Materials
            </div>

            {!bomFileName ? (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed rgba(255,255,255,0.12)', borderRadius: '8px', padding: '24px 12px', cursor: 'pointer', textAlign: 'center' }}>
                <Upload size={22} color="rgba(255,255,255,0.25)" />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>Upload BOM CSV</span>
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleBomUpload} />
              </label>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={14} color="#4ade80" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', wordBreak: 'break-all' }}>{bomFileName}</span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{bomEntries.length} entries loaded</div>
                <button onClick={() => { setBomFileName(null); setBomEntries([]) }} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(248,113,113,0.7)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', padding: 0 }}>
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            )}

            {bomEntries.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</div>
                {bomEntries.slice(0, 40).map((b, i) => (
                  <div key={i} style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '4px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{b.sku}</span>
                    {b.component && <span style={{ color: 'rgba(255,255,255,0.25)' }}> · {b.component}</span>}
                    <span style={{ color: '#38bdf8', marginLeft: '4px' }}>×{b.qty}</span>
                  </div>
                ))}
                {bomEntries.length > 40 && <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '10px' }}>+{bomEntries.length - 40} more…</div>}
              </div>
            )}
          </div>

          {/* RIGHT — Fields + Report */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              {[
                { label: 'Department', value: department, set: setDepartment, placeholder: 'Inventory Control' },
                { label: 'Requested By', value: name, set: setName, placeholder: 'Your name' },
                { label: 'Fulfill By', value: fulfillBy, set: setFulfillBy, placeholder: 'Assigned to' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{f.label}</label>
                  <input
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 10px', color: 'white', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              ))}
            </div>

            {/* Printable area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div ref={printRef}>
                <h1>Ecom Single Restock</h1>
                <div className="meta">
                  <div className="meta-item"><label>Ticket #</label><span>{ticketNumber.current}</span></div>
                  <div className="meta-item"><label>Department</label><span>{department || '—'}</span></div>
                  <div className="meta-item"><label>Requested By</label><span>{name || '—'}</span></div>
                  <div className="meta-item"><label>Fulfill By</label><span>{fulfillBy || '—'}</span></div>
                  <div className="meta-item"><label>Date</label><span>{date}</span></div>
                  <div className="meta-item"><label>Items</label><span>{items.length}</span></div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '150px' }}>Product ID</th>
                      <th>Description</th>
                      <th className="r">Qty to Restock (4wk)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(r => (
                      <tr key={r.product_id}>
                        <td style={{ fontFamily: 'monospace' }}>{r.product_id}</td>
                        <td>{r.product_name ?? '—'}</td>
                        <td className="r qty">{fmt(r.qtyToRestock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="footer">Nami · Ecom Single Restock · {ticketNumber.current} · {date}</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function EcomRestockPanel() {
  const [rows, setRows] = useState<RestockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ecom-restock')
      const data = await res.json()
      setRows(data.rows ?? [])
      if (data.error) setError(data.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const tableRows: DerivedRow[] = rows.map(r => {
    const daily = (r.sales_60d ?? 0) / 60
    const restockPoint = Math.ceil(daily * 7)
    const qtyToRestock = Math.max(0, Math.ceil(daily * 28) - r.qoh)
    return { ...r, restockPoint, qtyToRestock }
  })

  const needsRestock = tableRows.filter(r => r.qtyToRestock > 0)
  const ok = tableRows.filter(r => r.qtyToRestock === 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {showReport && <ReportModal items={needsRestock} onClose={() => setShowReport(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">Ecom Single Restock</h2>
          <p className="text-white/40 text-xs mt-0.5">-01 SKUs · Restock Point = 1-week supply · Qty to Restock targets 4-week supply</p>
        </div>
        <div className="flex items-center gap-2">
          {needsRestock.length > 0 && (
            <button
              onClick={() => setShowReport(true)}
              className="flex items-center gap-1.5 text-xs bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-600/30 rounded px-3 py-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Generate Report ({needsRestock.length})
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-xs bg-red-900/20 border border-red-900/30 rounded px-3 py-2">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#1a1f2e] border-b border-white/10 text-white/50 text-left">
                <th className="px-3 py-2.5 font-medium">Product ID</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium text-right">Stock QoH</th>
                <th className="px-3 py-2.5 font-medium text-right">Last 60D Sale</th>
                <th className="px-3 py-2.5 font-medium text-right">Restock Point (1wk)</th>
                <th className="px-3 py-2.5 font-medium text-right">Qty to Restock (4wk)</th>
              </tr>
            </thead>
            <tbody>
              {needsRestock.length > 0 && (
                <>
                  <tr className="bg-red-950/30">
                    <td colSpan={6} className="px-3 py-1.5 text-red-400/70 text-[10px] font-semibold uppercase tracking-wider">
                      Needs Restock ({needsRestock.length})
                    </td>
                  </tr>
                  {needsRestock.map(r => (
                    <tr key={r.product_id} className="border-b border-white/5 hover:bg-white/5 bg-red-950/10">
                      <td className="px-3 py-2 font-mono text-white/90">{r.product_id}</td>
                      <td className="px-3 py-2 text-white/60 max-w-[240px] truncate">{r.product_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-white/80">{fmt(r.qoh)}</td>
                      <td className="px-3 py-2 text-right text-white/80">{r.sales_60d != null ? fmt(r.sales_60d) : '—'}</td>
                      <td className="px-3 py-2 text-right text-white/80">{fmt(r.restockPoint)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-400">{fmt(r.qtyToRestock)}</td>
                    </tr>
                  ))}
                </>
              )}
              {ok.length > 0 && (
                <>
                  <tr className="bg-white/5">
                    <td colSpan={6} className="px-3 py-1.5 text-white/30 text-[10px] font-semibold uppercase tracking-wider">
                      OK — Sufficient Stock ({ok.length})
                    </td>
                  </tr>
                  {ok.map(r => (
                    <tr key={r.product_id} className="border-b border-white/5 hover:bg-white/5 opacity-60">
                      <td className="px-3 py-2 font-mono text-white/70">{r.product_id}</td>
                      <td className="px-3 py-2 text-white/50 max-w-[240px] truncate">{r.product_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-white/70">{fmt(r.qoh)}</td>
                      <td className="px-3 py-2 text-right text-white/70">{r.sales_60d != null ? fmt(r.sales_60d) : '—'}</td>
                      <td className="px-3 py-2 text-right text-white/70">{fmt(r.restockPoint)}</td>
                      <td className="px-3 py-2 text-right text-green-500/80">✓</td>
                    </tr>
                  ))}
                </>
              )}
              {tableRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-white/30">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No data — run a Finale sync first
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
