import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureTables() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS reconcile_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      bin_name      TEXT NOT NULL,
      counted_by    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'counting',
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT,
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS reconcile_lines (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      INTEGER NOT NULL REFERENCES reconcile_sessions(id) ON DELETE CASCADE,
      product_id      TEXT NOT NULL,
      product_name    TEXT,
      hand_count      REAL NOT NULL DEFAULT 0,
      finale_qty      REAL,
      variance        REAL,
      analysis        TEXT,
      resolution      TEXT,
      resolved_qty    REAL,
      resolved_by     TEXT,
      resolved_at     TEXT
    );
  `)
  return db
}

// GET: list sessions or bin overview
export async function GET(req: NextRequest) {
  const db = ensureTables()
  const view = new URL(req.url).searchParams.get('view')

  if (view === 'bins') {
    const bins = db.prepare(`
      SELECT f.facility_name AS bin_name,
        (SELECT rs.status FROM reconcile_sessions rs WHERE rs.bin_name = f.facility_name ORDER BY rs.id DESC LIMIT 1) AS last_status,
        (SELECT rs.completed_at FROM reconcile_sessions rs WHERE rs.bin_name = f.facility_name AND rs.status = 'resolved' ORDER BY rs.id DESC LIMIT 1) AS last_resolved,
        (SELECT COUNT(*) FROM reconcile_sessions rs WHERE rs.bin_name = f.facility_name) AS session_count
      FROM finale_facilities f
      WHERE f.facility_name LIKE 'SFS-_-__-__-%'
      AND f.status != 'FACILITY_INACTIVE'
      ORDER BY f.facility_name
    `).all()
    return NextResponse.json({ bins })
  }

  if (view === 'progress') {
    const totalBins = (db.prepare("SELECT COUNT(DISTINCT facility_name) as c FROM finale_facilities WHERE facility_name LIKE 'SFS-_-__-__-%' AND status != 'FACILITY_INACTIVE'").get() as { c: number }).c
    const resolvedBins = (db.prepare("SELECT COUNT(DISTINCT bin_name) as c FROM reconcile_sessions WHERE status = 'resolved'").get() as { c: number }).c
    const inProgress = db.prepare("SELECT * FROM reconcile_sessions WHERE status != 'resolved' ORDER BY started_at DESC").all()
    const recent = db.prepare(`
      SELECT rs.*,
        (SELECT COUNT(*) FROM reconcile_lines rl WHERE rl.session_id = rs.id) AS total_lines,
        (SELECT COUNT(*) FROM reconcile_lines rl WHERE rl.session_id = rs.id AND rl.variance = 0) AS matched_lines,
        (SELECT COUNT(*) FROM reconcile_lines rl WHERE rl.session_id = rs.id AND rl.variance != 0) AS variance_lines,
        (SELECT COUNT(*) FROM reconcile_lines rl WHERE rl.session_id = rs.id AND rl.resolution IS NOT NULL) AS resolved_lines
      FROM reconcile_sessions rs ORDER BY rs.started_at DESC LIMIT 20
    `).all()

    const racks = db.prepare(`
      SELECT SUBSTR(f.facility_name, 5, 1) AS rack,
        COUNT(DISTINCT f.facility_name) AS total_bins,
        COUNT(DISTINCT rs.bin_name) AS resolved_bins
      FROM finale_facilities f
      LEFT JOIN reconcile_sessions rs ON rs.bin_name = f.facility_name AND rs.status = 'resolved'
      WHERE f.facility_name LIKE 'SFS-_-__-__-%' AND f.status != 'FACILITY_INACTIVE'
      GROUP BY SUBSTR(f.facility_name, 5, 1)
      ORDER BY rack
    `).all()

    return NextResponse.json({ totalBins, resolvedBins, inProgress, recent, racks })
  }

  const sessions = db.prepare(`
    SELECT rs.*,
      (SELECT COUNT(*) FROM reconcile_lines rl WHERE rl.session_id = rs.id) AS total_lines
    FROM reconcile_sessions rs ORDER BY rs.started_at DESC LIMIT 50
  `).all()
  return NextResponse.json({ sessions })
}

// POST: start a new reconciliation session
export async function POST(req: NextRequest) {
  const db = ensureTables()
  const body = await req.json()
  const { bin_name, counted_by } = body

  if (!bin_name || !counted_by) {
    return NextResponse.json({ error: 'bin_name and counted_by required' }, { status: 400 })
  }

  const result = db.prepare(`
    INSERT INTO reconcile_sessions (bin_name, counted_by)
    VALUES (?, ?)
  `).run(bin_name, counted_by)

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
}
