'use client'

import { useState, useEffect, useRef } from 'react'
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

interface BomEntry {
  sku: string
  component: string
  qty: number
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
      const text = ev.target?.result as string
      setBomEntries(parseBomCsv(text))
    }
    reader.readAsText(file)
  }

  function handlePrint() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
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
        </head>
        <body>${content}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-semibold text-base">Restock Report</h2>
            <p className="text-white/40 text-xs mt-0.5">{items.length} items · Ticket {ticketNumber.current}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded px-3 py-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/80 p-1.5 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: left BOM panel + right report */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT — BOM Upload */}
          <div className="w-60 shrink-0 border-r border-white/10 flex flex-col p-4 gap-4">
            <div>
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Bill of Materials</p>

              {!bomFileName ? (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/10 hover:border-sky-500/40 rounded-lg p-5 cursor-pointer transition-colors group">
                  <Upload className="w-6 h-6 text-white/20 group-hover:text-sky-400 transition-colors" />
                  <span className="text-white/30 text-xs text-center group-hover:text-white/50 transition-colors">Upload BOM CSV</span>
                  <input type="file" accept=".csv" className="hidden" onChange={handleBomUpload} />
                </label>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    <span className="text-white/70 text-xs break-all">{bomFileName}</span>
                  </div>
                  <p className="text-white/40 text-[10px]">{bomEntries.length} entries loaded</p>
                  <button
                    onClick={() => { setBomFileName(null); setBomEntries([]) }}
                    className="flex items-center gap-1 text-[10px] text-red-400/60 hover:text-red-400 transition-colors mt-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              )}
            </div>

            {bomEntries.length > 0 && (
              <div className="flex-1 overflow-auto">
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Preview</p>
                <div className="flex flex-col gap-1">
                  {bomEntries.slice(0, 30).map((b, i) => (
                    <div key={i} className="text-[10px] text-white/50 border-b border-white/5 pb-1">
                      <span className="text-white/70 font-mono">{b.sku}</span>
                      {b.component && <span className="text-white/30"> · {b.component}</span>}
                      <span className="text-sky-400 ml-1">×{b.qty}</span>
                    </div>
                  ))}
                  {bomEntries.length > 30 && (
                    <p className="text-white/20 text-[10px]">+{bomEntries.length - 30} more…</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Fields + Printable report */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Fields */}
            <div className="px-5 pt-4 pb-3 grid grid-cols-3 gap-3 border-b border-white/10">
              <div className="flex flex-col gap-1">
                <label className="text-white/40 text-[10px] uppercase tracking-wider">Department</label>
                <input
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Inventory Control"
                  className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-sky-500/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-white/40 text-[10px] uppercase tracking-wider">Requested By</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-sky-500/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-white/40 text-[10px] uppercase tracking-wider">Fulfill By</label>
                <input
                  value={fulfillBy}
                  onChange={e => setFulfillBy(e.target.value)}
                  placeholder="Assigned to"
                  className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-sky-500/50"
                />
              </div>
            </div>

            {/* Printable content */}
            <div className="flex-1 overflow-auto p-5">
          <div ref={printRef}>
            <h1>Ecom Single Restock</h1>
            <div className="meta">
              <div className="meta-item">
                <label>Ticket #</label>
                <span>{ticketNumber.current}</span>
              </div>
              <div className="meta-item">
                <label>Department</label>
                <span>{department || '—'}</span>
              </div>
              <div className="meta-item">
                <label>Requested By</label>
                <span>{name || '—'}</span>
              </div>
              <div className="meta-item">
                <label>Fulfill By</label>
                <span>{fulfillBy || '—'}</span>
              </div>
              <div className="meta-item">
                <label>Date</label>
                <span>{date}</span>
              </div>
              <div className="meta-item">
                <label>Items</label>
                <span>{items.length}</span>
              </div>
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
          </div>{/* end right panel */}
        </div>{/* end body */}
      </div>
    </div>
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
