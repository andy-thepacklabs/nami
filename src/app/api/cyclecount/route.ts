import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function ensureTables() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycle_counts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      bin_name      TEXT NOT NULL,
      counted_by    TEXT NOT NULL,
      count_type    TEXT NOT NULL DEFAULT 'hard_count',
      status        TEXT NOT NULL DEFAULT 'in_progress',
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT,
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS cycle_count_lines (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id      INTEGER NOT NULL REFERENCES cycle_counts(id) ON DELETE CASCADE,
      product_id    TEXT NOT NULL,
      product_name  TEXT,
      quantity      REAL NOT NULL DEFAULT 0,
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS trusted_inventory (
      product_id    TEXT NOT NULL,
      bin_name      TEXT NOT NULL,
      quantity      REAL NOT NULL DEFAULT 0,
      counted_by    TEXT NOT NULL,
      count_id      INTEGER,
      established_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_verified  TEXT,
      verify_count   INTEGER DEFAULT 1,
      PRIMARY KEY (product_id, bin_name)
    );

    CREATE INDEX IF NOT EXISTS idx_cc_bin ON cycle_counts(bin_name);
    CREATE INDEX IF NOT EXISTS idx_cc_status ON cycle_counts(status);
    CREATE INDEX IF NOT EXISTS idx_ti_bin ON trusted_inventory(bin_name);
  `)
  return db
}

// GET: list cycle counts + bin overview
export async function GET(req: NextRequest) {
  const db = ensureTables()
  const view = new URL(req.url).searchParams.get('view')

  if (view === 'bins') {
    // All SFS rack bins with their count status
    const bins = db.prepare(`
      SELECT f.facility_name AS bin_name,
        (SELECT COUNT(DISTINCT ti.product_id) FROM trusted_inventory ti WHERE ti.bin_name = f.facility_name) AS trusted_products,
        (SELECT MAX(cc.completed_at) FROM cycle_counts cc WHERE cc.bin_name = f.facility_name AND cc.status = 'completed') AS last_counted,
        (SELECT cc.counted_by FROM cycle_counts cc WHERE cc.bin_name = f.facility_name AND cc.status = 'completed' ORDER BY cc.completed_at DESC LIMIT 1) AS last_counted_by,
        (SELECT COUNT(*) FROM cycle_counts cc WHERE cc.bin_name = f.facility_name AND cc.status = 'completed') AS total_counts
      FROM finale_facilities f
      WHERE f.facility_name LIKE 'SFS-_-__-__-%'
      AND f.status != 'FACILITY_INACTIVE'
      ORDER BY f.facility_name
    `).all()
    return NextResponse.json({ bins })
  }

  if (view === 'progress') {
    let totalBins = 0, racks: unknown[] = []
    try {
      totalBins = (db.prepare("SELECT COUNT(DISTINCT facility_name) as c FROM finale_facilities WHERE facility_name LIKE 'SFS-_-__-__-%' AND status != 'FACILITY_INACTIVE'").get() as {c:number}).c
      racks = db.prepare(`
        SELECT SUBSTR(f.facility_name, 5, 1) AS rack,
          COUNT(DISTINCT f.facility_name) AS total_bins,
          COUNT(DISTINCT ti.bin_name) AS counted_bins
        FROM finale_facilities f
        LEFT JOIN trusted_inventory ti ON ti.bin_name = f.facility_name
        WHERE f.facility_name LIKE 'SFS-_-__-__-%' AND f.status != 'FACILITY_INACTIVE'
        GROUP BY SUBSTR(f.facility_name, 5, 1)
        ORDER BY rack
      `).all()
    } catch { /* finale_facilities not synced yet */ }

    const countedBins = (db.prepare("SELECT COUNT(DISTINCT bin_name) as c FROM trusted_inventory").get() as {c:number}).c
    const totalTrusted = (db.prepare("SELECT COUNT(*) as c FROM trusted_inventory").get() as {c:number}).c
    const recentCounts = db.prepare(`
      SELECT cc.*,
        (SELECT COUNT(*) FROM cycle_count_lines cl WHERE cl.count_id = cc.id) AS line_count
      FROM cycle_counts cc
      WHERE cc.bin_name LIKE 'SFS-%'
      ORDER BY cc.started_at DESC LIMIT 10
    `).all()

    return NextResponse.json({ totalBins, countedBins, totalTrusted, recentCounts, racks })
  }

  // Default: recent counts
  const counts = db.prepare(`
    SELECT cc.*,
      (SELECT COUNT(*) FROM cycle_count_lines cl WHERE cl.count_id = cc.id) AS line_count
    FROM cycle_counts cc ORDER BY cc.started_at DESC LIMIT 50
  `).all()
  return NextResponse.json({ counts })
}

// POST: start a new cycle count for a bin
export async function POST(req: NextRequest) {
  const db = ensureTables()
  const body = await req.json()
  const { bin_name, counted_by, count_type } = body

  if (!bin_name || !counted_by) {
    return NextResponse.json({ error: 'bin_name and counted_by required' }, { status: 400 })
  }

  const type = count_type || 'hard_count'
  const result = db.prepare(`
    INSERT INTO cycle_counts (bin_name, counted_by, count_type)
    VALUES (?, ?, ?)
  `).run(bin_name, counted_by, type)

  return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
}
