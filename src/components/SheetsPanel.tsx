'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X, RefreshCw, CheckCircle2, AlertCircle, FileSpreadsheet,
  Download, AlertTriangle, Check, XCircle, Minus, Search, ArrowRight, Upload, ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComparisonLine {
  productId: string
  productName: string | null
  binLocation: string
  finaleQty: number
  physicalCount: number
  variance: number
  variancePct: number
  status: 'match' | 'variance' | 'not_in_finale' | 'not_counted'
}

interface ComparisonResult {
  id: number
  lines: ComparisonLine[]
  summary: {
    totalLines: number
    matched: number
    variances: number
    notInFinale: number
    notCounted: number
    totalVarianceUnits: number
  }
  importedAt: string
}

type View = 'setup' | 'results'
type InputMode = 'csv' | 'compare' | 'google'

export default function SheetsPanel({ onClose, onVariancesFound }: {
  onClose: () => void
  onVariancesFound: () => void
}) {
  const [view, setView] = useState<View>('setup')
  const [inputMode, setInputMode] = useState<InputMode>('compare')
  const [sheetId, setSheetId] = useState(process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '')
  const [sheetRange, setSheetRange] = useState('Sheet1')
  const [countedBy, setCountedBy] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; sheetTitle?: string; rowCount?: number; headers?: string[]; error?: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const [importError, setImportError] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [finaleFile, setFinaleFile] = useState<File | null>(null)
  const [physicalFile, setPhysicalFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [stockFile, setStockFile] = useState<File | null>(null)
  const [uploadingStock, setUploadingStock] = useState(false)
  const [stockStatus, setStockStatus] = useState<{ count: number; syncedAt: string | null } | null>(null)
  type FilterKey = 'all' | 'variance' | 'not_counted' | 'match'
  const [filter, setFilter] = useState<FilterKey>('all')

  const runCompareImport = async () => {
    if (!finaleFile || !physicalFile || !countedBy.trim()) return
    setImporting(true)
    setImportError('')
    try {
      const form = new FormData()
      form.append('finaleFile', finaleFile)
      form.append('physicalFile', physicalFile)
      form.append('countedBy', countedBy.trim())
      const res = await fetch('/api/sheets/compare-csv', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
      } else {
        setComparison(data)
        setView('results')
        if (data.summary.variances > 0 || data.summary.notCounted > 0) onVariancesFound()
      }
    } catch (err) {
      setImportError((err as Error).message)
    }
    setImporting(false)
  }

  const uploadStockCsv = async (file: File) => {
    setUploadingStock(true)
    setImportError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/finale/import-stock-csv', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
      } else {
        setStockStatus({ count: data.imported, syncedAt: data.syncedAt })
        setStockFile(null)
      }
    } catch (err) {
      setImportError((err as Error).message)
    }
    setUploadingStock(false)
  }

  const runCsvImport = async () => {
    if (!csvFile || !countedBy.trim()) return
    setImporting(true)
    setImportError('')
    try {
      const form = new FormData()
      form.append('file', csvFile)
      form.append('countedBy', countedBy.trim())
      const res = await fetch('/api/sheets/csv', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
      } else {
        setComparison(data)
        setView('results')
        if (data.summary.variances > 0 || data.summary.notCounted > 0) onVariancesFound()
      }
    } catch (err) {
      setImportError((err as Error).message)
    }
    setImporting(false)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const res = await fetch(`/api/sheets?id=${encodeURIComponent(sheetId)}`)
    setTestResult(await res.json())
    setTesting(false)
  }

  const runImport = async () => {
    if (!countedBy.trim()) return
    setImporting(true)
    setImportError('')
    try {
      const res = await fetch('/api/sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, range: sheetRange, countedBy: countedBy.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
      } else {
        setComparison(data)
        setView('results')
        if (data.summary.variances > 0 || data.summary.notCounted > 0) {
          onVariancesFound()
        }
      }
    } catch (err) {
      setImportError((err as Error).message)
    }
    setImporting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0a07] border border-orange-900/30 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-orange-900/30">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-orange-500" />
            <h2 className="font-bold text-white uppercase tracking-wide text-sm">Sheet Count Comparison</h2>
          </div>
          <div className="flex items-center gap-2">
            {comparison && (
              <button onClick={() => setView(view === 'setup' ? 'results' : 'setup')} className="btn-ghost text-xs">
                {view === 'setup' ? 'View Results' : 'New Import'}
              </button>
            )}
            <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'setup' && (
            <div className="p-6 flex flex-col gap-5 max-w-xl">
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-[#12100d] rounded-lg border border-orange-900/20">
                <button
                  onClick={() => setInputMode('compare')}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-colors',
                    inputMode === 'compare' ? 'bg-orange-500/20 text-orange-400' : 'text-orange-800 hover:text-orange-400'
                  )}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Finale vs Physical
                </button>
                <button
                  onClick={() => setInputMode('csv')}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-colors',
                    inputMode === 'csv' ? 'bg-orange-500/20 text-orange-400' : 'text-orange-800 hover:text-orange-400'
                  )}
                >
                  <Upload className="w-3.5 h-3.5" /> Physical vs Nami DB
                </button>
                <button
                  onClick={() => setInputMode('google')}
                  className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-colors',
                    inputMode === 'google' ? 'bg-orange-500/20 text-orange-400' : 'text-orange-800 hover:text-orange-400'
                  )}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Google Sheets
                </button>
              </div>

              {inputMode === 'compare' ? (
                <>
                  {/* Finale export */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em]">
                        Finale Stock Export
                      </label>
                    </div>
                    <div className="text-[10px] text-orange-800 mb-2 leading-relaxed">
                      In Finale: <span className="text-orange-500">Inventory → Stock → Location: SFS-HQ → Export</span>
                      <br />Include columns: Product ID, Description, Stock QoH, Sublocations
                    </div>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFinaleFile(f) }}
                      onClick={() => document.getElementById('finale-upload')?.click()}
                      className={cn('border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                        finaleFile ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-orange-900/40 hover:border-orange-700/60'
                      )}
                    >
                      <input id="finale-upload" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setFinaleFile(f) }} />
                      {finaleFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-sm font-medium">{finaleFile.name}</span>
                          <span className="text-xs text-orange-700">({Math.round(finaleFile.size / 1024)}KB)</span>
                        </div>
                      ) : (
                        <div>
                          <Download className="w-6 h-6 text-orange-800 mx-auto mb-1" />
                          <p className="text-sm text-orange-600 font-medium">Drop exported CSV here</p>
                          <p className="text-xs text-orange-900 mt-0.5">Drag the downloaded file straight from your browser</p>
                        </div>
                      )}
                    </div>
                    {finaleFile && <button onClick={() => setFinaleFile(null)} className="text-[10px] text-orange-700 hover:text-orange-400 mt-1">Remove</button>}
                  </div>

                  {/* Physical count */}
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">
                      Physical Count CSV <span className="text-orange-900 normal-case font-normal">(your cycle count sheet)</span>
                    </label>
                    <div
                      onDragOver={e => { e.preventDefault() }}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setPhysicalFile(f) }}
                      onClick={() => document.getElementById('physical-upload')?.click()}
                      className={cn('border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                        physicalFile ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-orange-900/40 hover:border-orange-700/60'
                      )}
                    >
                      <input id="physical-upload" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPhysicalFile(f) }} />
                      {physicalFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-sm font-medium">{physicalFile.name}</span>
                          <span className="text-xs text-orange-700">({Math.round(physicalFile.size / 1024)}KB)</span>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-6 h-6 text-orange-800 mx-auto mb-1" />
                          <p className="text-sm text-orange-600 font-medium">Drop physical count CSV here</p>
                          <p className="text-xs text-orange-900 mt-0.5">Needs: Product ID + Count columns</p>
                        </div>
                      )}
                    </div>
                    {physicalFile && <button onClick={() => setPhysicalFile(null)} className="text-[10px] text-orange-700 hover:text-orange-400 mt-1">Remove</button>}
                  </div>

                  {/* Counted by */}
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">Counted By</label>
                    <input className="input w-full" placeholder="Who did the count?" value={countedBy} onChange={e => setCountedBy(e.target.value)} />
                  </div>

                  <button
                    onClick={runCompareImport}
                    disabled={importing || !finaleFile || !physicalFile || !countedBy.trim()}
                    className="btn-primary text-xs"
                  >
                    {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    {importing ? 'Comparing...' : 'Compare Finale vs Physical'}
                  </button>
                </>
              ) : inputMode === 'csv' ? (
                <>
                  {/* Step 1: Upload Finale stock export */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em]">
                        Step 1 — Finale Stock Export
                      </label>
                    </div>
                    <div
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadStockCsv(f) }}
                      onClick={() => document.getElementById('stock-upload')?.click()}
                      className={cn(
                        'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                        stockStatus?.count ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-orange-900/40 hover:border-orange-700/60'
                      )}
                    >
                      <input id="stock-upload" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadStockCsv(f) }} />
                      {uploadingStock ? (
                        <p className="text-xs text-orange-400 flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" /> Importing stock data...
                        </p>
                      ) : stockStatus?.count ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-sm font-medium">{stockStatus.count} products loaded</span>
                          <span className="text-xs text-orange-700">— drop to replace</span>
                        </div>
                      ) : (
                        <div>
                          <Download className="w-6 h-6 text-orange-800 mx-auto mb-1" />
                          <p className="text-sm text-orange-600 font-medium">Drop Finale stock export here</p>
                          <p className="text-xs text-orange-900 mt-0.5">In Finale: Products → Export · Needs Product ID + QoH columns</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Physical count CSV */}
                  {/* CSV drop zone */}
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">
                      Step 2 — Physical Count CSV
                    </label>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setCsvFile(f) }}
                      onClick={() => document.getElementById('csv-upload')?.click()}
                      className={cn(
                        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                        dragOver ? 'border-orange-500 bg-orange-500/10' : 'border-orange-900/40 hover:border-orange-700/60',
                        csvFile && 'border-emerald-500/40 bg-emerald-500/5'
                      )}
                    >
                      <input id="csv-upload" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setCsvFile(f) }} />
                      {csvFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-sm font-medium">{csvFile.name}</span>
                          <span className="text-xs text-orange-700">({Math.round(csvFile.size / 1024)}KB)</span>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-8 h-8 text-orange-800 mx-auto mb-2" />
                          <p className="text-sm text-orange-600 font-medium">Drop your CSV here or click to browse</p>
                          <p className="text-xs text-orange-900 mt-1">Export from Google Sheets: File → Download → CSV</p>
                        </div>
                      )}
                    </div>
                    {csvFile && (
                      <button onClick={() => setCsvFile(null)} className="text-[10px] text-orange-700 hover:text-orange-400 mt-1.5">
                        Remove file
                      </button>
                    )}
                  </div>

                  {/* Counter name */}
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">Counted By</label>
                    <input className="input w-full" placeholder="Who did the count?" value={countedBy} onChange={e => setCountedBy(e.target.value)} />
                  </div>

                  <button
                    onClick={runCsvImport}
                    disabled={importing || !csvFile || !countedBy.trim() || !stockStatus?.count}
                    className="btn-primary text-xs"
                  >
                    {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {importing ? 'Comparing...' : 'Step 3 — Compare Physical vs Finale'}
                  </button>
                </>
              ) : (
                <>
                  {/* Sheet ID */}
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">Google Sheet ID</label>
                    <input className="input w-full" placeholder="Paste the spreadsheet ID from the URL..." value={sheetId} onChange={e => setSheetId(e.target.value)} />
                    <p className="text-[10px] text-orange-900 mt-1.5">
                      From the URL: docs.google.com/spreadsheets/d/<span className="text-orange-500">THIS_PART</span>/edit
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">Sheet Tab Name</label>
                    <input className="input w-full" placeholder="Sheet1" value={sheetRange} onChange={e => setSheetRange(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] block mb-2">Counted By</label>
                    <input className="input w-full" placeholder="Who did the count?" value={countedBy} onChange={e => setCountedBy(e.target.value)} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={testConnection} disabled={testing || !sheetId} className="btn-ghost text-xs">
                      {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Test Connection
                    </button>
                    <button onClick={runImport} disabled={importing || !sheetId || !countedBy.trim()} className="btn-primary text-xs">
                      {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {importing ? 'Importing...' : 'Import & Compare'}
                    </button>
                  </div>
                  {testResult && (
                    <div className={cn('card p-4', testResult.ok ? 'border-emerald-500/20' : 'border-red-500/20')}>
                      {testResult.ok ? (
                        <div>
                          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase mb-2"><CheckCircle2 className="w-4 h-4" /> Connected</div>
                          <div className="text-xs text-orange-200/70 space-y-1">
                            <p>Sheet: {testResult.sheetTitle}</p><p>Rows: {testResult.rowCount}</p><p>Headers: {testResult.headers?.join(', ')}</p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase mb-2"><AlertCircle className="w-4 h-4" /> Connection Failed</div>
                          <p className="text-xs text-red-300">{testResult.error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {importError && (
                <div className="card p-4 border-red-500/20">
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase mb-1"><AlertCircle className="w-4 h-4" /> Import Failed</div>
                  <p className="text-xs text-red-300">{importError}</p>
                </div>
              )}

              {/* Column format guide */}
              <div className="card p-4 bg-[#12100d]">
                <p className="text-[10px] font-bold text-orange-700 uppercase tracking-[0.2em] mb-2">Expected Format</p>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr className="text-orange-500">
                        <th className="pr-6 py-1 text-left">Product ID</th>
                        <th className="pr-6 py-1 text-left">Bin Location</th>
                        <th className="pr-6 py-1 text-left">Physical Count</th>
                      </tr>
                    </thead>
                    <tbody className="text-orange-200/50 font-mono">
                      <tr><td className="pr-6 py-0.5">P5D-TP-10PK</td><td className="pr-6">SFS-B-04-01-L</td><td>120</td></tr>
                      <tr><td className="pr-6 py-0.5">P5D-CC-10PK</td><td className="pr-6">SFS-B-04-01-C</td><td>85</td></tr>
                      <tr><td className="pr-6 py-0.5">ECC-CF-01</td><td className="pr-6">SFS-B-07-01-R</td><td>200</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-orange-900 mt-2">Headers are auto-detected. Column names should include &quot;product/sku/item&quot;, &quot;bin/location&quot;, and &quot;count/qty/physical&quot;.</p>
              </div>
            </div>
          )}

          {view === 'results' && comparison && (
            <ResultsView comparison={comparison} filter={filter} setFilter={setFilter} />
          )}
        </div>
      </div>
    </div>
  )
}

type FilterKey = 'all' | 'variance' | 'not_counted' | 'match'

function getReportRows(comparison: ComparisonResult, filter: FilterKey) {
  const { lines, summary } = comparison
  const filtered = lines.filter(l => {
    if (filter === 'variance') return l.status === 'variance'
    if (filter === 'not_counted') return l.status === 'not_counted'
    if (filter === 'match') return l.status === 'match'
    return true
  })
  const statusLabel = (s: string) =>
    s === 'match' ? 'Match' : s === 'variance' ? 'Variance' : s === 'not_counted' ? 'Not Counted' : 'Not in Finale'
  return { filtered, summary, statusLabel }
}

async function exportExcel(comparison: ComparisonResult, filter: FilterKey) {
  const { utils, writeFile } = await import('xlsx')
  const { filtered, summary, statusLabel } = getReportRows(comparison, filter)
  const date = new Date().toISOString().slice(0, 10)

  const summarySheet = utils.aoa_to_sheet([
    [`Nami Inventory Comparison Report — ${date}`],
    [],
    ['Metric', 'Value'],
    ['Total Lines', summary.totalLines],
    ['Matched', summary.matched],
    ['Variances', summary.variances],
    ['Not Counted', summary.notCounted],
    ['Variance Units', summary.totalVarianceUnits],
  ])

  const dataSheet = utils.aoa_to_sheet([
    ['Status', 'Product ID', 'Description', 'Bin', 'Finale QoH', 'Physical Count', 'Variance', 'Variance %'],
    ...filtered.map(l => [
      statusLabel(l.status),
      l.productId,
      l.productName ?? '',
      l.binLocation,
      l.finaleQty,
      l.physicalCount,
      l.variance,
      l.variancePct / 100,
    ])
  ])

  // Format variance % column as percentage
  const range = utils.decode_range(dataSheet['!ref'] || 'A1')
  for (let r = 1; r <= range.e.r; r++) {
    const cell = dataSheet[utils.encode_cell({ r, c: 7 })]
    if (cell) cell.z = '0.0%'
  }

  const wb = utils.book_new()
  utils.book_append_sheet(wb, summarySheet, 'Summary')
  utils.book_append_sheet(wb, dataSheet, 'Comparison')
  writeFile(wb, `nami-comparison-${date}.xlsx`)
}

async function exportPdf(comparison: ComparisonResult, filter: FilterKey) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { filtered, summary, statusLabel } = getReportRows(comparison, filter)
  const date = new Date().toISOString().slice(0, 10)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Title
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text(`Nami Inventory Comparison Report`, 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generated: ${date}`, 14, 22)

  // Summary table
  autoTable(doc, {
    startY: 28,
    head: [['Metric', 'Value']],
    body: [
      ['Total Lines', summary.totalLines],
      ['Matched', summary.matched],
      ['Variances', summary.variances],
      ['Not Counted', summary.notCounted],
      ['Variance Units', summary.totalVarianceUnits],
    ],
    theme: 'grid',
    headStyles: { fillColor: [180, 80, 20], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: 'right' } },
    tableWidth: 80,
  })

  // Data table
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 60
  autoTable(doc, {
    startY: finalY + 8,
    head: [['Status', 'Product ID', 'Description', 'Bin', 'Finale QoH', 'Physical', 'Variance', 'Var %']],
    body: filtered.map(l => [
      statusLabel(l.status),
      l.productId,
      l.productName ?? '',
      l.binLocation,
      l.finaleQty,
      l.physicalCount,
      l.variance > 0 ? `+${l.variance}` : l.variance,
      `${l.variancePct > 0 ? '+' : ''}${l.variancePct}%`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [180, 80, 20], textColor: 255, fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const v = Number(data.cell.raw)
        if (v > 0) data.cell.styles.textColor = [220, 80, 80]
        else if (v < 0) data.cell.styles.textColor = [80, 180, 80]
      }
    },
  })

  doc.save(`nami-comparison-${date}.pdf`)
}

function generateCsv(comparison: ComparisonResult, filter: FilterKey) {
  const { filtered, summary, statusLabel } = getReportRows(comparison, filter)
  const date = new Date().toISOString().slice(0, 10)
  const rows = [
    [`Nami Inventory Comparison Report — ${date}`],
    [],
    ['Summary'],
    ['Total Lines', summary.totalLines],
    ['Matched', summary.matched],
    ['Variances', summary.variances],
    ['Not Counted', summary.notCounted],
    ['Variance Units', summary.totalVarianceUnits],
    [],
    ['Status', 'Product ID', 'Description', 'Bin', 'Finale QoH', 'Physical Count', 'Variance', 'Variance %'],
    ...filtered.map(l => [
      statusLabel(l.status),
      l.productId,
      l.productName ?? '',
      l.binLocation,
      l.finaleQty,
      l.physicalCount,
      l.variance > 0 ? `+${l.variance}` : l.variance,
      `${l.variancePct > 0 ? '+' : ''}${l.variancePct}%`,
    ])
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nami-comparison-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function ExportDropdown({ comparison, filter }: { comparison: ComparisonResult; filter: FilterKey }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handle = async (type: 'excel' | 'pdf' | 'csv') => {
    setOpen(false)
    setLoading(type)
    try {
      if (type === 'excel') await exportExcel(comparison, filter)
      else if (type === 'pdf') await exportPdf(comparison, filter)
      else generateCsv(comparison, filter)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wide hover:bg-orange-500/30 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        {loading ? `Exporting ${loading.toUpperCase()}…` : 'Export Report'}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-orange-900/40 bg-[#1a1510] shadow-xl z-50 overflow-hidden">
          {[
            { type: 'excel' as const, label: 'Excel (.xlsx)', icon: '📊' },
            { type: 'pdf' as const, label: 'PDF', icon: '📄' },
            { type: 'csv' as const, label: 'CSV', icon: '📋' },
          ].map(opt => (
            <button
              key={opt.type}
              onClick={() => handle(opt.type)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-orange-300 hover:bg-orange-500/15 transition-colors text-left"
            >
              <span>{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ResultsView({ comparison, filter, setFilter }: {
  comparison: ComparisonResult
  filter: FilterKey
  setFilter: (f: FilterKey) => void
}) {
  const { lines, summary } = comparison

  const filtered = lines.filter(l => {
    if (filter === 'variance') return l.status === 'variance'
    if (filter === 'not_counted') return l.status === 'not_counted'
    if (filter === 'match') return l.status === 'match'
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Summary cards */}
      <div className="px-6 py-4 border-b border-orange-900/30 bg-[#12100d]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid grid-cols-5 gap-3 flex-1">
            <SumCard label="Total Lines" value={summary.totalLines} color="text-orange-400" />
            <SumCard label="Matched" value={summary.matched} color="text-emerald-400" />
            <SumCard label="Variances" value={summary.variances} color="text-red-400" />
            <SumCard label="Not Counted" value={summary.notCounted} color="text-amber-400" />
            <SumCard label="Variance Units" value={summary.totalVarianceUnits} color="text-orange-500" />
          </div>
          <ExportDropdown comparison={comparison} filter={filter} />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-orange-900/30 px-6">
        {([
          { key: 'all', label: `All (${lines.length})` },
          { key: 'variance', label: `Variances (${summary.variances})` },
          { key: 'not_counted', label: `Not Counted (${summary.notCounted})` },
          { key: 'match', label: `Matched (${summary.matched})` },
        ] as { key: typeof filter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors',
              filter === key ? 'border-orange-500 text-orange-400' : 'border-transparent text-orange-900 hover:text-orange-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0d0a07]">
            <tr className="border-b border-orange-900/30">
              <th className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Status</th>
              <th className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Product</th>
              <th className="text-left text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Bin</th>
              <th className="text-right text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Finale</th>
              <th className="text-center text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]"></th>
              <th className="text-right text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Physical</th>
              <th className="text-right text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">Variance</th>
              <th className="text-right text-[10px] font-bold text-orange-700 px-4 py-3 uppercase tracking-[0.15em]">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-orange-900/20">
            {filtered.map((l, i) => (
              <tr key={i} className={cn('transition-colors',
                l.status === 'variance' && 'bg-red-500/5',
                l.status === 'not_counted' && 'bg-amber-500/5',
              )}>
                <td className="px-4 py-2.5">
                  {l.status === 'match' && <Check className="w-4 h-4 text-emerald-500" />}
                  {l.status === 'variance' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  {l.status === 'not_counted' && <XCircle className="w-4 h-4 text-amber-400" />}
                  {l.status === 'not_in_finale' && <Minus className="w-4 h-4 text-orange-700" />}
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-mono text-xs text-orange-100 font-medium">{l.productId}</div>
                  {l.productName && l.productName !== l.productId && (
                    <div className="text-[10px] text-orange-300/40 truncate max-w-[200px]">{l.productName}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-orange-400">{l.binLocation}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-orange-200/70 tabular-nums">{l.finaleQty}</td>
                <td className="px-4 py-2.5 text-center"><ArrowRight className="w-3 h-3 text-orange-900 mx-auto" /></td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-white font-bold tabular-nums">{l.physicalCount}</td>
                <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-bold tabular-nums',
                  l.variance < 0 ? 'text-red-400' : l.variance > 0 ? 'text-amber-400' : 'text-emerald-400'
                )}>
                  {l.variance > 0 ? '+' : ''}{l.variance}
                </td>
                <td className={cn('px-4 py-2.5 text-right font-mono text-[10px] tabular-nums',
                  Math.abs(l.variancePct) > 20 ? 'text-red-400' : 'text-orange-800'
                )}>
                  {l.variancePct > 0 ? '+' : ''}{l.variancePct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SumCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={cn('text-xl font-black tabular-nums', color)}>{value}</div>
      <div className="text-[10px] text-orange-700 font-bold uppercase tracking-[0.15em]">{label}</div>
    </div>
  )
}
