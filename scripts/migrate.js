const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const fs = require('fs')

const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)

const DB_PATH = path.join(dataDir, 'nami.db')
const db = new DatabaseSync(DB_PATH)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    role       TEXT NOT NULL DEFAULT 'operator',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discrepancies (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number     TEXT NOT NULL,
    sku              TEXT NOT NULL,
    bin_location     TEXT NOT NULL,
    expected_qty     INTEGER NOT NULL,
    shipped_qty      INTEGER NOT NULL,
    discrepancy_type TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'open',
    priority         TEXT NOT NULL DEFAULT 'medium',
    assigned_to      INTEGER REFERENCES users(id),
    source           TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS notes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    discrepancy_id     INTEGER NOT NULL REFERENCES discrepancies(id) ON DELETE CASCADE,
    author_id          INTEGER REFERENCES users(id),
    author_name        TEXT NOT NULL,
    body               TEXT NOT NULL,
    photo_url          TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    discrepancy_id     INTEGER NOT NULL REFERENCES discrepancies(id) ON DELETE CASCADE,
    actor_name         TEXT NOT NULL,
    action             TEXT NOT NULL,
    from_value         TEXT,
    to_value           TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_disc_status   ON discrepancies(status);
  CREATE INDEX IF NOT EXISTS idx_disc_sku      ON discrepancies(sku);
  CREATE INDEX IF NOT EXISTS idx_disc_order    ON discrepancies(order_number);
  CREATE INDEX IF NOT EXISTS idx_disc_bin      ON discrepancies(bin_location);
  CREATE INDEX IF NOT EXISTS idx_disc_created  ON discrepancies(created_at);
`)

// Seed demo users
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get()
if (userCount.c === 0) {
  const ins = db.prepare(`INSERT INTO users (name, email, role) VALUES (?, ?, ?)`)
  ins.run('Alex Rivera',   'alex@warehouse.local',  'supervisor')
  ins.run('Jordan Kim',    'jordan@warehouse.local', 'operator')
  ins.run('Sam Torres',    'sam@warehouse.local',    'operator')
  ins.run('Casey Nguyen',  'casey@warehouse.local',  'lead')
}

// Seed demo discrepancies
const discCount = db.prepare('SELECT COUNT(*) as c FROM discrepancies').get()
if (discCount.c === 0) {
  const ins = db.prepare(`
    INSERT INTO discrepancies (order_number, sku, bin_location, expected_qty, shipped_qty,
      discrepancy_type, status, priority, assigned_to, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ? || ' hours'), datetime('now', ? || ' hours'))
  `)

  const rows = [
    ['ORD-10041', 'SKU-4821', 'A-01-03', 3,  2,  'short_shipped',  'open',      'high',     2, 'ShipStation', '-1',  '-1'],
    ['ORD-10038', 'SKU-2039', 'B-12-07', 10, 12, 'over_shipped',   'open',      'medium',   3, 'ShipStation', '-2',  '-2'],
    ['ORD-10035', 'SKU-7714', 'C-04-11', 5,  5,  'wrong_bin',      'in_review', 'high',     4, 'WMS',         '-3',  '-3'],
    ['ORD-10029', 'SKU-1102', 'D-08-02', 8,  0,  'not_deducted',   'open',      'critical', 2, 'WMS',         '-5',  '-5'],
    ['ORD-10022', 'SKU-8850', 'A-05-09', 4,  4,  'bin_count_off',  'open',      'medium',   3, 'Cycle Count', '-8',  '-8'],
    ['ORD-10017', 'SKU-3367', 'B-02-14', 2,  4,  'duplicate_scan', 'escalated', 'critical', 4, 'WMS',         '-12', '-12'],
    ['ORD-10009', 'SKU-6628', 'C-11-06', 6,  5,  'scan_mismatch',  'resolved',  'low',      2, 'ShipStation', '-24', '-24'],
    ['ORD-10044', 'SKU-2039', 'A-01-03', 1,  3,  'over_shipped',   'open',      'medium',   3, 'ShipStation', '0',   '0'],
  ]

  for (const row of rows) ins.run(...row)

  const noteIns = db.prepare(`INSERT INTO notes (discrepancy_id, author_name, body, created_at) VALUES (?, ?, ?, datetime('now', ? || ' hours'))`)
  noteIns.run(1, 'Jordan Kim',   'Pulled from bin A-01-03, only 2 units were present. Bin shelf looked partially stocked.', '-0.5')
  noteIns.run(3, 'Casey Nguyen', 'Item was picked from wrong bin C-04-11 instead of C-04-09. Relabeling in progress.',     '-2.5')
  noteIns.run(6, 'Alex Rivera',  'Escalated to management — second occurrence this week for this SKU.',                    '-11')
  noteIns.run(7, 'Sam Torres',   'Verified in system and physical count now matches. Closed.',                             '-20')

  const auditIns = db.prepare(`INSERT INTO audit_log (discrepancy_id, actor_name, action, from_value, to_value, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ? || ' hours'))`)
  auditIns.run(3, 'Casey Nguyen', 'status_change', 'open',      'in_review', '-2.5')
  auditIns.run(6, 'Alex Rivera',  'status_change', 'in_review', 'escalated', '-11')
  auditIns.run(7, 'Sam Torres',   'status_change', 'open',      'resolved',  '-20')
  auditIns.run(7, 'Sam Torres',   'note_added',    null,        null,        '-20')
}

console.log('✓ Database migrated:', DB_PATH)
db.close()
