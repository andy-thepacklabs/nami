// Uses the built-in node:sqlite module (Node 22+) — no native compilation needed
import { DatabaseSync } from 'node:sqlite'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'nami.db')

let _db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH)
    _db.exec('PRAGMA journal_mode = WAL')
    _db.exec('PRAGMA foreign_keys = ON')
  }
  return _db
}

export type DiscrepancyStatus = 'open' | 'in_review' | 'escalated' | 'resolved'
export type DiscrepancyPriority = 'low' | 'medium' | 'high' | 'critical'
export type DiscrepancyType =
  | 'short_shipped'
  | 'over_shipped'
  | 'wrong_bin'
  | 'bin_count_off'
  | 'duplicate_scan'
  | 'scan_mismatch'
  | 'not_deducted'

export interface Discrepancy {
  id: number
  order_number: string
  sku: string
  bin_location: string
  expected_qty: number
  shipped_qty: number
  discrepancy_type: DiscrepancyType
  status: DiscrepancyStatus
  priority: DiscrepancyPriority
  assigned_to: number | null
  assigned_name: string | null
  source: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  note_count: number
}

export interface Note {
  id: number
  discrepancy_id: number
  author_name: string
  body: string
  photo_url: string | null
  created_at: string
}

export interface AuditEntry {
  id: number
  discrepancy_id: number
  actor_name: string
  action: string
  from_value: string | null
  to_value: string | null
  created_at: string
}

export interface DashboardStats {
  total_open: number
  total_critical: number
  total_escalated: number
  resolved_today: number
  total_all: number
}
