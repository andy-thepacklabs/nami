import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DiscrepancyType, DiscrepancyStatus, DiscrepancyPriority } from './db'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const TYPE_LABELS: Record<DiscrepancyType, string> = {
  short_shipped:  'Short Shipped',
  over_shipped:   'Over Shipped',
  wrong_bin:      'Wrong Bin',
  bin_count_off:  'Bin Count Off',
  duplicate_scan: 'Duplicate Scan',
  scan_mismatch:  'Scan Mismatch',
  not_deducted:   'Not Deducted',
}

export const STATUS_LABELS: Record<DiscrepancyStatus, string> = {
  open:      'Open',
  in_review: 'In Review',
  escalated: 'Escalated',
  resolved:  'Resolved',
}

export const PRIORITY_LABELS: Record<DiscrepancyPriority, string> = {
  low:      'Low',
  medium:   'Medium',
  high:     'High',
  critical: 'Critical',
}

export const STATUS_COLORS: Record<DiscrepancyStatus, string> = {
  open:      'text-orange-300 bg-orange-500/10 border-orange-500/20',
  in_review: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  escalated: 'text-red-400 bg-red-500/10 border-red-500/20',
  resolved:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

export const PRIORITY_COLORS: Record<DiscrepancyPriority, string> = {
  low:      'text-orange-300/50 bg-orange-500/5 border-orange-500/10',
  medium:   'text-orange-300 bg-orange-500/10 border-orange-500/20',
  high:     'text-orange-400 bg-orange-500/15 border-orange-500/30',
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export function fmtDelta(created_at: string) {
  const ms = Date.now() - new Date(created_at).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export const FACILITY_PREFIX = 'SFS-'

export const EXCLUDED_CATEGORIES = [
  'NON-INVENTORY',
  'BUNDLES',
  'OFFICE SUPPLIES',
  'PRODUCTION SUPPLIES',
  'PROMOTIONAL',
  'SAMPLES',
  'MARKETING',
  'RAW MATERIALS',
  'RAW PACKAGING',
  'RAW LABELS',
  'RAW OIL',
  'RAW MYLARS',
  'RAW CANDY',
  'WIP',
  'FORMULATIONS',
]
