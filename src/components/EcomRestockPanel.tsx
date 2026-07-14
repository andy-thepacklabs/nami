'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Package, FileText, Printer, X, Upload, CheckCircle2, Trash2, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

interface RestockRow {
  product_id: string
  product_name: string | null
  qoh: number
  sales_60d: number | null
  bin_locations: string | null
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

function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      cols.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur.trim())
  return cols
}

function parseBomCsv(text: string): { entries: BomEntry[]; error?: string } {
  const clean = text.replace(/^﻿/, '')
  const lines = clean.trim().split(/\r?\n/)
  if (lines.length < 2) return { entries: [], error: 'File is empty or has only one row' }

  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim())

  const parentIdx = header.findIndex(h =>
    h.includes('parent') || h === 'product id' || h === 'product_id' || h.includes('sku')
  )
  const childIdx = header.findIndex(h =>
    h.includes('child') || h.includes('component') || h.includes('material')
  )
  const qtyIdx = header.findIndex(h =>
    h.includes('bom qty') || h.includes('bom_qty') ||
    (h.includes('qty') && !h.includes('child') && !h.includes('component'))
  )

  if (parentIdx === -1 || childIdx === -1) {
    return { entries: [], error: `Could not find required columns. Found: [${header.join(', ')}]` }
  }

  const entries = lines.slice(1).flatMap(line => {
    if (!line.trim()) return []
    const cols = parseCsvLine(line)
    const sku       = cols[parentIdx]?.trim()
    const component = cols[childIdx]?.trim()
    const qty       = qtyIdx >= 0 ? parseFloat(cols[qtyIdx]) : 1
    if (!sku || !component || isNaN(qty)) return []
    return [{ sku, component, qty }]
  })

  return { entries }
}

interface BreakdownLine {
  displaySku: string        // e.g. EGBB-05-8PK
  packsToBreak: number      // how many display packs to break
  singlesYielded: number    // singles recovered = packsToBreak × qty_in_bom
  recovered: { component: string; totalQty: number }[]  // other materials recovered
}

function buildBreakdown(items: DerivedRow[], bomEntries: BomEntry[]): Map<string, BreakdownLine[]> {
  const parentToComponents = new Map<string, { component: string; qty: number }[]>()
  const componentToParents = new Map<string, { parent: string; qty: number }[]>()

  for (const b of bomEntries) {
    const parent = b.sku?.trim().toUpperCase()
    const child  = b.component?.trim().toUpperCase()
    if (!parent || !child || !b.qty) continue
    if (!parentToComponents.has(parent)) parentToComponents.set(parent, [])
    parentToComponents.get(parent)!.push({ component: b.component.trim(), qty: b.qty })
    if (!componentToParents.has(child)) componentToParents.set(child, [])
    componentToParents.get(child)!.push({ parent: b.sku.trim(), qty: b.qty })
  }

  const result = new Map<string, BreakdownLine[]>()
  for (const item of items) {
    const key = item.product_id.trim().toUpperCase()
    const DISPLAY_PACK_SUFFIXES = ['-10PK', '-8PK', '-6PK', '-5PK']
    const sources = (componentToParents.get(key) ?? []).filter(s =>
      DISPLAY_PACK_SUFFIXES.some(suffix => s.parent.toUpperCase().endsWith(suffix))
    )
    if (sources.length === 0) continue
    const lines: BreakdownLine[] = sources.map(src => {
      const packsToBreak = Math.ceil(item.qtyToRestock / src.qty)
      const allComponents = parentToComponents.get(src.parent.trim().toUpperCase()) ?? []
      const recovered = allComponents
        .filter(c => c.component.trim().toUpperCase() !== key)
        .map(c => ({ component: c.component, totalQty: c.qty * packsToBreak }))
      return { displaySku: src.parent, packsToBreak, singlesYielded: src.qty * packsToBreak, recovered }
    })
    result.set(item.product_id, lines)
  }
  return result
}

function ReportModal({ items, bomEntries, packBinMap, onClose }: { items: DerivedRow[]; bomEntries: BomEntry[]; packBinMap: Map<string, string>; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null)
  const [department, setDepartment] = useState('Inventory Control')
  const [name, setName] = useState('Andy Nguyen')
  const [fulfillBy, setFulfillBy] = useState('')
  const ticketNumber = useRef(genTicketNumber())
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const breakdown = buildBreakdown(items, bomEntries)

  // Pre-compute all breakdown lines and total recovered materials
  const allBreakdownLines: { item: DerivedRow; line: BreakdownLine }[] = []
  const totalRecovered = new Map<string, number>()
  items.forEach(item => {
    const lines = breakdown.get(item.product_id) ?? []
    lines.forEach(line => {
      allBreakdownLines.push({ item, line })
      line.recovered.forEach(r => {
        totalRecovered.set(r.component, (totalRecovered.get(r.component) ?? 0) + r.totalQty)
      })
    })
  })
  const hasBreakdown = allBreakdownLines.length > 0

  function getRestockSheet() {
    return items.map(r => ({
      'Product ID': r.product_id,
      'Description': r.product_name ?? '',
      'Bin Location': r.bin_locations ?? '',
      'Qty to Restock (4wk)': r.qtyToRestock,
    }))
  }

  function getBreakdownSheet() {
    const rows: Record<string, string | number>[] = []
    allBreakdownLines.forEach(({ item, line }) => {
      rows.push({
        'Single SKU': item.product_id,
        'Restock To (Bin)': item.bin_locations ?? '',
        'Display Pack': line.displaySku,
        'Display Pack Bin': packBinMap.get(line.displaySku.toUpperCase()) ?? '',
        'Packs to Break': line.packsToBreak,
        'Singles Yielded': line.singlesYielded,
      })
      line.recovered.forEach(r => {
        rows.push({
          'Single SKU': '',
          'Restock To (Bin)': '',
          'Display Pack': '',
          'Display Pack Bin': '',
          'Packs to Break': '',
          'Singles Yielded': '',
          'Material Collected': r.component,
          'Qty': r.totalQty,
        })
      })
    })
    return rows
  }

  function getTotalRecoveredSheet() {
    return Array.from(totalRecovered.entries()).map(([comp, qty]) => ({
      'Component / Raw Material': comp,
      'Total Qty Collected': qty,
    }))
  }

  function getInfoRows() {
    return [
      { Field: 'Ticket #',      Value: ticketNumber.current },
      { Field: 'Department',    Value: department },
      { Field: 'Requested By',  Value: name },
      { Field: 'Fulfill By',    Value: fulfillBy || '—' },
      { Field: 'Date',          Value: date },
      { Field: 'Items',         Value: items.length },
    ]
  }

  function handleExcelExport() {
    const wb = XLSX.utils.book_new()
    // Info sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getInfoRows()), 'Info')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getRestockSheet()), 'Restock List')
    if (allBreakdownLines.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getBreakdownSheet()), 'Breakdown Plan')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getTotalRecoveredSheet()), 'Raw Materials Collected')
    }
    XLSX.writeFile(wb, `Restock-${ticketNumber.current}.xlsx`)
  }

  function sheetToCsvBlock(rows: Record<string, string | number>[]) {
    if (rows.length === 0) return ''
    const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
    const lines = [headers.map(h => `"${h}"`).join(',')]
    rows.forEach(r => lines.push(headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')))
    return lines.join('\n')
  }

  function handleCsvExport() {
    const info = getInfoRows().map(r => `"${r.Field}","${r.Value}"`).join('\n')
    const sections: string[] = [`=== ECOM SINGLE RESTOCK ===`, info, '', `=== RESTOCK LIST ===`, sheetToCsvBlock(getRestockSheet())]
    if (allBreakdownLines.length > 0) {
      sections.push('', `=== DISPLAY PACK BREAKDOWN PLAN ===`, sheetToCsvBlock(getBreakdownSheet()))
      sections.push('', `=== TOTAL RAW MATERIALS COLLECTED ===`, sheetToCsvBlock(getTotalRecoveredSheet()))
    }
    const csv = sections.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Restock-${ticketNumber.current}.csv`
    a.click()
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
        .section-title { font-size: 13px; font-weight: 700; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; color: #111; }
        .breakdown-card { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
        .breakdown-header { background: #f3f4f6; padding: 8px 12px; display: flex; gap: 16px; align-items: baseline; }
        .breakdown-header .pack { font-family: monospace; font-weight: 700; font-size: 12px; color: #1d4ed8; }
        .breakdown-header .meta { font-size: 10px; color: #666; }
        .breakdown-body { padding: 8px 12px; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
        .breakdown-row:last-child { border-bottom: none; }
        .recovered-label { color: #059669; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .footer { margin-top: 24px; font-size: 10px; color: #999; }
        @media print { body { padding: 16px; } }
      </style>
    </head><body>${content}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: '16px' }}>
      <div style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', width: '100%', maxWidth: '820px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: '15px' }}>Restock Report</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '2px' }}>
              {items.length} items · Ticket {ticketNumber.current}
              {bomEntries.length > 0
                ? <span style={{ color: '#4ade80', marginLeft: 8 }}>✓ BOM {bomEntries.length} entries · {allBreakdownLines.length} matches</span>
                : <span style={{ color: '#f87171', marginLeft: 8 }}>⚠ No BOM loaded</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleCsvExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer' }}>
              <Download size={13} /> CSV
            </button>
            <button onClick={handleExcelExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'rgba(21,128,61,0.2)', color: '#4ade80', border: '1px solid rgba(21,128,61,0.3)', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer' }}>
              <Download size={13} /> Excel
            </button>
            <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer' }}>
              <Printer size={13} /> Print / PDF
            </button>
            <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {[
            { label: 'Department', value: department, set: setDepartment },
            { label: 'Requested By', value: name, set: setName },
            { label: 'Fulfill By', value: fulfillBy, set: setFulfillBy },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{f.label}</label>
              <input
                value={f.value}
                onChange={e => f.set(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '6px 10px', color: 'white', fontSize: '13px', outline: 'none', width: '100%' }}
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
                  <th style={{ width: '120px' }}>Bin Location</th>
                  <th className="r">Qty to Restock (4wk)</th>
                </tr>
              </thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.product_id}>
                    <td style={{ fontFamily: 'monospace' }}>{r.product_id}</td>
                    <td>{r.product_name ?? '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{r.bin_locations ?? '—'}</td>
                    <td className="r qty">{fmt(r.qtyToRestock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasBreakdown && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, margin: '28px 0 10px', paddingBottom: 6, borderBottom: '2px solid #e5e7eb' }}>
                  Display Pack Breakdown Plan
                </div>
                {allBreakdownLines.map(({ item, line }) => (
                  <div key={item.product_id + line.displaySku} style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ background: '#f3f4f6', padding: '8px 12px', display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#1d4ed8' }}>{line.displaySku}</span>
                      {packBinMap.get(line.displaySku.toUpperCase()) && (
                        <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>
                          📦 {packBinMap.get(line.displaySku.toUpperCase())}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: '#555' }}>
                        Break <strong>{line.packsToBreak}</strong> pack{line.packsToBreak !== 1 ? 's' : ''} → yields <strong>{line.singlesYielded}</strong>× {item.product_id}
                        {item.bin_locations && <span style={{ marginLeft: 8, background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>→ {item.bin_locations}</span>}
                      </span>
                    </div>
                    {line.recovered.length > 0 && (
                      <div style={{ padding: '8px 12px' }}>
                        <div style={{ color: '#059669', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                          Materials collected back
                        </div>
                        {line.recovered.map(r => (
                          <div key={r.component} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ fontFamily: 'monospace' }}>{r.component}</span>
                            <span style={{ fontWeight: 600 }}>×{r.totalQty}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {totalRecovered.size > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, margin: '28px 0 10px', paddingBottom: 6, borderBottom: '2px solid #059669', color: '#059669' }}>
                      Total Raw Materials Collected Back
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Component / Raw Material</th>
                          <th style={{ textAlign: 'right' }}>Total Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(totalRecovered.entries()).map(([comp, qty]) => (
                          <tr key={comp}>
                            <td style={{ fontFamily: 'monospace' }}>{comp}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <p className="footer">Nami · Ecom Single Restock · {ticketNumber.current} · {date}</p>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}

export default function EcomRestockPanel() {
  const [rows, setRows] = useState<RestockRow[]>([])
  const [packBinMap, setPackBinMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [bomEntries, setBomEntries] = useState<BomEntry[]>([])
  const [bomLoaded, setBomLoaded] = useState(false)
  const [bomSaving, setBomSaving] = useState(false)
  const [bomError, setBomError] = useState<string | null>(null)
  const [triggerWeeks, setTriggerWeeks] = useState(1)
  const [restockWeeks, setRestockWeeks] = useState(4)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ecom-restock')
      const data = await res.json()
      setRows(data.rows ?? [])
      if (data.packBins) {
        const m = new Map<string, string>()
        ;(data.packBins as { product_id: string; bin_locations: string | null }[]).forEach(r => {
          if (r.bin_locations) m.set(r.product_id.toUpperCase(), r.bin_locations)
        })
        setPackBinMap(m)
      }
      if (data.error) setError(data.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadBom() {
    try {
      const res = await fetch('/api/bom')
      const data = await res.json()
      if (data.rows?.length > 0) {
        setBomEntries(data.rows.map((r: { parent_id: string; child_id: string; bom_qty: number }) => ({
          sku: r.parent_id, component: r.child_id, qty: r.bom_qty
        })))
        setBomLoaded(true)
      }
    } catch { /* silent */ }
  }

  useEffect(() => { load(); loadBom() }, [])

  function handleBomUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      setBomError(null)
      const { entries, error: parseError } = parseBomCsv(ev.target?.result as string)
      if (entries.length === 0) {
        setBomError(parseError ?? 'No valid rows found in CSV')
        return
      }
      setBomEntries(entries)
      setBomLoaded(true)
      setBomSaving(true)
      try {
        const res = await fetch('/api/bom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) })
        const data = await res.json()
        if (data.error) setBomError(`Save failed: ${data.error}`)
      } catch (e) {
        setBomError(`Save failed: ${String(e)}`)
      } finally {
        setBomSaving(false)
      }
    }
    reader.readAsText(file)
  }

  async function clearBom() {
    setBomEntries([])
    setBomLoaded(false)
    await fetch('/api/bom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [] }) })
  }

  const tableRows: DerivedRow[] = rows.map(r => {
    const daily = (r.sales_60d ?? 0) / 60
    const restockPoint = Math.ceil(daily * triggerWeeks * 7)
    const qtyToRestock = Math.max(0, Math.ceil(daily * restockWeeks * 7) - r.qoh)
    return { ...r, restockPoint, qtyToRestock }
  })

  // Show in "needs restock" only when QoH has dropped to or below the trigger point
  const needsRestock = tableRows.filter(r => r.qoh <= r.restockPoint && r.qtyToRestock > 0)
  const ok = tableRows.filter(r => r.qoh > r.restockPoint || r.qtyToRestock === 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {showReport && <ReportModal items={needsRestock} bomEntries={bomEntries} packBinMap={packBinMap} onClose={() => setShowReport(false)} />}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-base">Ecom Single Restock</h2>
            <p className="text-white/40 text-xs mt-0.5">-01 SKUs · Restock Point = {triggerWeeks}wk supply · Qty to Restock targets {restockWeeks}wk supply</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Week selectors */}
            <div className="flex items-center gap-1.5 text-xs text-white/50 border border-white/10 rounded px-3 py-1.5 bg-white/5">
              <span className="text-white/30">Trigger</span>
              <select value={triggerWeeks} onChange={e => setTriggerWeeks(Number(e.target.value))}
                className="bg-transparent text-white font-semibold outline-none cursor-pointer">
                {[1,2,3,4,6,8].map(w => <option key={w} value={w} className="bg-[#111]">{w}wk</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50 border border-white/10 rounded px-3 py-1.5 bg-white/5">
              <span className="text-white/30">Restock to</span>
              <select value={restockWeeks} onChange={e => setRestockWeeks(Number(e.target.value))}
                className="bg-transparent text-white font-semibold outline-none cursor-pointer">
                {[2,3,4,6,8,12].map(w => <option key={w} value={w} className="bg-[#111]">{w}wk</option>)}
              </select>
            </div>
            {/* BOM Upload */}
            {!bomLoaded ? (
              <label className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded px-3 py-1.5 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload BOM
                <input type="file" accept=".csv" className="hidden" onChange={handleBomUpload} />
              </label>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-green-400 border border-green-600/30 bg-green-600/10 rounded px-3 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {bomSaving ? 'Saving…' : `BOM · ${bomEntries.length} entries`}
                <label className="ml-1 text-white/30 hover:text-white/60 cursor-pointer" title="Replace BOM">
                  <Upload className="w-3 h-3" />
                  <input type="file" accept=".csv" className="hidden" onChange={handleBomUpload} />
                </label>
                <button onClick={clearBom} className="text-white/30 hover:text-white/60" title="Remove BOM">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

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
        {bomError && (
          <div className="text-red-400 text-xs bg-red-900/20 border border-red-900/30 rounded px-3 py-2">BOM: {bomError}</div>
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
