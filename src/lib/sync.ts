import { getDb } from './db'
import {
  fetchProducts, fetchFacilities, fetchShipments, fetchOrders, fetchTransfers, fetchWorkEfforts, fetchInventoryLevels,
  FinaleUnavailableError,
  type FinaleProduct, type FinaleFacility, type FinaleWorkEffort
} from './finale'
import { runAllDetectionRules, type DetectionSummary } from './detection'
import { EXCLUDED_CATEGORIES, FACILITY_PREFIX } from './utils'

export interface SyncResult {
  products: number
  facilities: number
  shipments: number
  orders: number
  transfers: number
  builds: number
  stockLevels: number
  detection: DetectionSummary | null
  errors: string[]
  timestamp: string
}

export async function runFullSync(): Promise<SyncResult> {
  const db = getDb()
  const errors: string[] = []
  let discrepanciesFound = 0

  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_products (
      product_id    TEXT PRIMARY KEY,
      product_url   TEXT NOT NULL,
      internal_name TEXT,
      status        TEXT,
      product_type  TEXT,
      container_id  TEXT,
      upc           TEXT,
      cost          REAL,
      category      TEXT,
      last_updated  TEXT,
      created_date  TEXT,
      raw_json      TEXT,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finale_facilities (
      facility_id   TEXT PRIMARY KEY,
      facility_url  TEXT NOT NULL,
      facility_name TEXT NOT NULL,
      facility_type TEXT,
      status        TEXT,
      parent_url    TEXT,
      raw_json      TEXT,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finale_shipments (
      shipment_id   TEXT PRIMARY KEY,
      shipment_url  TEXT NOT NULL,
      status        TEXT,
      order_url     TEXT,
      facility_url  TEXT,
      ship_date     TEXT,
      shipment_type TEXT,
      raw_json      TEXT,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finale_orders (
      order_id      TEXT PRIMARY KEY,
      order_url     TEXT NOT NULL,
      status        TEXT,
      order_type    TEXT,
      order_date    TEXT,
      raw_json      TEXT,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finale_builds (
      work_effort_id  TEXT PRIMARY KEY,
      work_effort_url TEXT NOT NULL,
      status          TEXT,
      facility_url    TEXT,
      product_id      TEXT,
      quantity         REAL,
      complete_date   TEXT,
      start_date      TEXT,
      synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finale_build_lines (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      work_effort_id  TEXT NOT NULL,
      line_type       TEXT NOT NULL,
      product_id      TEXT NOT NULL,
      facility_url    TEXT NOT NULL,
      quantity        REAL NOT NULL,
      synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_fbl_weid ON finale_build_lines(work_effort_id);
    CREATE INDEX IF NOT EXISTS idx_fbl_type ON finale_build_lines(line_type);
    CREATE INDEX IF NOT EXISTS idx_fbl_product ON finale_build_lines(product_id);

    CREATE TABLE IF NOT EXISTS finale_transfers (
      transfer_url  TEXT PRIMARY KEY,
      product_id    TEXT NOT NULL,
      product_url   TEXT NOT NULL,
      quantity      REAL NOT NULL,
      facility_from TEXT NOT NULL,
      facility_to   TEXT NOT NULL,
      send_date     TEXT,
      receive_date  TEXT,
      comments      TEXT,
      lot_id        TEXT,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS computed_stock (
      product_id    TEXT NOT NULL,
      facility_url  TEXT NOT NULL,
      facility_name TEXT,
      product_name  TEXT,
      net_qty       REAL DEFAULT 0,
      synced_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, facility_url)
    );

    CREATE TABLE IF NOT EXISTS validation_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_url  TEXT NOT NULL,
      facility_name TEXT NOT NULL,
      counted_by    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'in_progress',
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT,
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS validation_counts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      INTEGER NOT NULL REFERENCES validation_sessions(id) ON DELETE CASCADE,
      product_id      TEXT NOT NULL,
      product_name    TEXT,
      expected_qty    REAL NOT NULL DEFAULT 0,
      hand_count      REAL,
      variance        REAL,
      status          TEXT NOT NULL DEFAULT 'pending',
      counted_at      TEXT,
      notes           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_cs_facility ON computed_stock(facility_url);
    CREATE INDEX IF NOT EXISTS idx_cs_product  ON computed_stock(product_id);
    CREATE INDEX IF NOT EXISTS idx_ft_product  ON finale_transfers(product_id);
    CREATE INDEX IF NOT EXISTS idx_ft_to       ON finale_transfers(facility_to);
    CREATE INDEX IF NOT EXISTS idx_ft_from     ON finale_transfers(facility_from);
    CREATE INDEX IF NOT EXISTS idx_vs_status   ON validation_sessions(status);

    CREATE TABLE IF NOT EXISTS sync_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type     TEXT NOT NULL,
      products      INTEGER DEFAULT 0,
      facilities    INTEGER DEFAULT 0,
      shipments     INTEGER DEFAULT 0,
      orders_synced INTEGER DEFAULT 0,
      discrepancies INTEGER DEFAULT 0,
      errors        TEXT,
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_fp_status    ON finale_products(status);
    CREATE INDEX IF NOT EXISTS idx_fp_name      ON finale_products(internal_name);
    CREATE INDEX IF NOT EXISTS idx_ff_name      ON finale_facilities(facility_name);
    CREATE INDEX IF NOT EXISTS idx_ff_parent    ON finale_facilities(parent_url);
  `)

  const logResult = db.prepare(`INSERT INTO sync_log (sync_type) VALUES ('full')`).run()
  const syncLogId = logResult.lastInsertRowid

  // Fetch all data from Finale in parallel (independent endpoints)
  const [
    productsResult,
    facilitiesResult,
    shipmentsResult,
    ordersResult,
    transfersResult,
    buildsResult,
    levelsResult,
  ] = await Promise.allSettled([
    fetchProducts(),
    fetchFacilities(),
    fetchShipments(),
    fetchOrders(),
    fetchTransfers(),
    fetchWorkEfforts(),
    fetchInventoryLevels(),
  ])

  // 1. Sync products
  let productCount = 0
  if (productsResult.status === 'fulfilled') {
    const products = productsResult.value
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO finale_products
        (product_id, product_url, internal_name, status, product_type,
         container_id, upc, cost, category, last_updated, created_date, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const p of products) {
      upsert.run(
        p.productId, p.productUrl, p.internalName ?? null,
        p.statusId ?? null, p.productTypeId ?? null,
        p.containerId ?? null, p.universalProductCode ?? null,
        p.cost ?? null, p.category ?? null,
        p.lastUpdatedDate ?? null, p.createdDate ?? null,
        JSON.stringify(p)
      )
    }
    productCount = products.length
  } else {
    errors.push(`Products: ${productsResult.reason?.message ?? productsResult.reason}`)
  }

  // 2. Sync facilities (locations/bins)
  let facilityCount = 0
  if (facilitiesResult.status === 'fulfilled') {
    const facilities = facilitiesResult.value
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO finale_facilities
        (facility_id, facility_url, facility_name, facility_type, status, parent_url, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const f of facilities) {
      upsert.run(
        f.facilityId, f.facilityUrl, f.facilityName,
        f.facilityTypeId ?? null, f.statusId ?? null,
        f.parentFacilityUrl ?? null, JSON.stringify(f)
      )
    }
    facilityCount = facilities.length
  } else {
    errors.push(`Facilities: ${facilitiesResult.reason?.message ?? facilitiesResult.reason}`)
  }

  // 3. Sync shipments (may 403 with read-only API keys)
  let shipmentCount = 0
  if (shipmentsResult.status === 'fulfilled') {
    const shipments = shipmentsResult.value
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO finale_shipments
        (shipment_id, shipment_url, status, order_url, facility_url,
         ship_date, shipment_type, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const s of shipments) {
      upsert.run(
        s.shipmentId, s.shipmentUrl, s.statusId ?? null,
        s.orderUrl ?? null, s.facilityUrl ?? null,
        s.shipDate ?? null, s.shipmentTypeId ?? null,
        JSON.stringify(s)
      )
    }
    shipmentCount = shipments.length
  } else {
    if (!(shipmentsResult.reason instanceof FinaleUnavailableError))
      errors.push(`Shipments: ${shipmentsResult.reason?.message ?? shipmentsResult.reason}`)
  }

  // 4. Sync orders (may 403 with read-only API keys)
  let orderCount = 0
  if (ordersResult.status === 'fulfilled') {
    const orders = ordersResult.value
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO finale_orders
        (order_id, order_url, status, order_type, order_date, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const o of orders) {
      upsert.run(
        o.orderId, o.orderUrl, o.statusId ?? null,
        o.orderTypeId ?? null, o.orderDate ?? null,
        JSON.stringify(o)
      )
    }
    orderCount = orders.length
  } else {
    if (!(ordersResult.reason instanceof FinaleUnavailableError))
      errors.push(`Orders: ${ordersResult.reason?.message ?? ordersResult.reason}`)
  }

  // 5. Sync inventory transfers
  let transferCount = 0
  if (transfersResult.status === 'fulfilled') {
    const transfers = transfersResult.value
    db.exec(`DELETE FROM finale_transfers`)
    const ins = db.prepare(`
      INSERT INTO finale_transfers
        (transfer_url, product_id, product_url, quantity,
         facility_from, facility_to, send_date, receive_date, comments, lot_id, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const t of transfers) {
      ins.run(
        t.inventoryTransferUrl, t.productId, t.productUrl,
        t.quantity ?? 0, t.facilityUrlFrom ?? '', t.facilityUrlTo ?? '',
        t.sendDate ?? null, t.receiveDate ?? null,
        t.generalComments ?? null, t.lotId ?? null
      )
    }
    transferCount = transfers.length
  } else {
    if (!(transfersResult.reason instanceof FinaleUnavailableError))
      errors.push(`Transfers: ${transfersResult.reason?.message ?? transfersResult.reason}`)
  }

  // 6. Sync builds (work efforts) — consume + produce lines
  let buildCount = 0
  if (buildsResult.status === 'fulfilled') {
    const builds = buildsResult.value
    db.exec(`DELETE FROM finale_builds`)
    db.exec(`DELETE FROM finale_build_lines`)

    const insBuild = db.prepare(`
      INSERT OR REPLACE INTO finale_builds
        (work_effort_id, work_effort_url, status, facility_url,
         product_id, quantity, complete_date, start_date, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    const insLine = db.prepare(`
      INSERT INTO finale_build_lines
        (work_effort_id, line_type, product_id, facility_url, quantity, synced_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `)

    for (const b of builds) {
      if (b.statusId !== 'PRUN_COMPLETED') continue

      insBuild.run(
        String(b.workEffortId ?? ''), String(b.workEffortUrl ?? ''), String(b.statusId ?? ''),
        b.facilityUrl ? String(b.facilityUrl) : null,
        b.productIdToProduce ? String(b.productIdToProduce) : null,
        Number(b.quantityToProduce ?? 0),
        b.completeDate ? String(b.completeDate) : null,
        b.startDate ? String(b.startDate) : null
      )

      if (Array.isArray(b.workEffortConsumeList)) {
        for (const c of b.workEffortConsumeList) {
          if (!c || !c.productId || !c.facilityUrl) continue
          insLine.run(String(b.workEffortId), 'consume', String(c.productId), String(c.facilityUrl), Number(c.quantity ?? 0))
        }
      }
      if (Array.isArray(b.workEffortProduceList)) {
        for (const p of b.workEffortProduceList) {
          if (!p || !p.productId || !p.facilityUrl) continue
          insLine.run(String(b.workEffortId), 'produce', String(p.productId), String(p.facilityUrl), Number(p.quantity ?? 0))
        }
      }
      buildCount++
    }
  } else {
    if (!(buildsResult.reason instanceof FinaleUnavailableError))
      errors.push(`Builds: ${buildsResult.reason?.message ?? buildsResult.reason}`)
  }

  // 7. Sync actual inventory levels from Finale (qty_on_hand per product+facility)
  let stockLevelCount = 0
  if (levelsResult.status === 'fulfilled') {
    const levels = levelsResult.value
    db.exec(`DELETE FROM computed_stock`)
    const ins = db.prepare(`
      INSERT INTO computed_stock (product_id, facility_url, facility_name, product_name, net_qty, synced_at)
      SELECT ?, ?,
             COALESCE((SELECT facility_name FROM finale_facilities WHERE facility_url = ?), ?),
             COALESCE((SELECT internal_name FROM finale_products WHERE product_id = ?), ?),
             ?, datetime('now')
    `)
    const upsert = db.transaction((rows: typeof levels) => {
      for (const l of rows) {
        if (!l.productId || !l.facilityUrl) continue
        const qty = Number(l.qtyOnHand ?? 0)
        if (qty === 0) continue
        ins.run(l.productId, l.facilityUrl, l.facilityUrl, l.facilityUrl, l.productId, l.productId, qty)
      }
    })
    upsert(levels)
    stockLevelCount = (db.prepare(`SELECT COUNT(*) as c FROM computed_stock`).get() as { c: number }).c
  } else {
    if (!(levelsResult.reason instanceof FinaleUnavailableError))
      errors.push(`Stock levels: ${levelsResult.reason?.message ?? levelsResult.reason}`)
  }

  // 6. Run automated detection rules
  let detection: DetectionSummary | null = null
  try {
    detection = runAllDetectionRules()
  } catch (err) {
    errors.push(`Detection: ${(err as Error).message}`)
  }

  // Complete sync log
  const totalDetected = detection?.totalCreated ?? 0
  db.prepare(`
    UPDATE sync_log SET
      products = ?, facilities = ?, shipments = ?, orders_synced = ?,
      discrepancies = ?, errors = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(productCount, facilityCount, shipmentCount, orderCount,
         totalDetected, errors.length ? errors.join('; ') : null, syncLogId)

  return {
    products: productCount,
    facilities: facilityCount,
    shipments: shipmentCount,
    orders: orderCount,
    transfers: transferCount,
    builds: buildCount,
    stockLevels: stockLevelCount,
    detection,
    errors,
    timestamp: new Date().toISOString(),
  }
}

// Lightweight sync — only fetches what the CSV compare needs (inventory levels + names)
export async function runStockSync(): Promise<{ stockLevels: number; errors: string[]; timestamp: string }> {
  const db = getDb()
  const errors: string[] = []

  db.exec(`
    CREATE TABLE IF NOT EXISTS finale_products (
      product_id TEXT PRIMARY KEY, product_url TEXT NOT NULL, internal_name TEXT,
      status TEXT, product_type TEXT, container_id TEXT, upc TEXT, cost REAL,
      category TEXT, last_updated TEXT, created_date TEXT, raw_json TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS finale_facilities (
      facility_id TEXT PRIMARY KEY, facility_url TEXT NOT NULL, facility_name TEXT NOT NULL,
      facility_type TEXT, status TEXT, parent_url TEXT, raw_json TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS computed_stock (
      product_id TEXT NOT NULL, facility_url TEXT NOT NULL, facility_name TEXT,
      product_name TEXT, net_qty REAL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, facility_url)
    );
    CREATE INDEX IF NOT EXISTS idx_cs_facility ON computed_stock(facility_url);
    CREATE INDEX IF NOT EXISTS idx_cs_product  ON computed_stock(product_id);
  `)

  // Fetch only what we need — in parallel
  const [productsResult, facilitiesResult, levelsResult] = await Promise.allSettled([
    fetchProducts(),
    fetchFacilities(),
    fetchInventoryLevels(),
  ])

  if (productsResult.status === 'fulfilled') {
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO finale_products
        (product_id, product_url, internal_name, status, product_type,
         container_id, upc, cost, category, last_updated, created_date, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const p of productsResult.value) {
      upsert.run(p.productId, p.productUrl, p.internalName ?? null, p.statusId ?? null,
        p.productTypeId ?? null, p.containerId ?? null, p.universalProductCode ?? null,
        p.cost ?? null, p.category ?? null, p.lastUpdatedDate ?? null, p.createdDate ?? null,
        JSON.stringify(p))
    }
  } else {
    errors.push(`Products: ${productsResult.reason?.message ?? productsResult.reason}`)
  }

  if (facilitiesResult.status === 'fulfilled') {
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO finale_facilities
        (facility_id, facility_url, facility_name, facility_type, status, parent_url, raw_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    for (const f of facilitiesResult.value) {
      upsert.run(f.facilityId, f.facilityUrl, f.facilityName, f.facilityTypeId ?? null,
        f.statusId ?? null, f.parentFacilityUrl ?? null, JSON.stringify(f))
    }
  } else {
    errors.push(`Facilities: ${facilitiesResult.reason?.message ?? facilitiesResult.reason}`)
  }

  let stockLevels = 0
  if (levelsResult.status === 'fulfilled') {
    const levels = levelsResult.value
    db.exec(`DELETE FROM computed_stock`)
    const ins = db.prepare(`
      INSERT INTO computed_stock (product_id, facility_url, facility_name, product_name, net_qty, synced_at)
      SELECT ?, ?,
             COALESCE((SELECT facility_name FROM finale_facilities WHERE facility_url = ?), ?),
             COALESCE((SELECT internal_name FROM finale_products WHERE product_id = ?), ?),
             ?, datetime('now')
    `)
    const upsert = db.transaction((rows: typeof levels) => {
      for (const l of rows) {
        if (!l.productId || !l.facilityUrl) continue
        const qty = Number(l.qtyOnHand ?? 0)
        if (qty === 0) continue
        ins.run(l.productId, l.facilityUrl, l.facilityUrl, l.facilityUrl, l.productId, l.productId, qty)
      }
    })
    upsert(levels)
    stockLevels = (db.prepare(`SELECT COUNT(*) as c FROM computed_stock`).get() as { c: number }).c
  } else {
    errors.push(`Stock levels: ${levelsResult.reason?.message ?? levelsResult.reason}`)
  }

  return { stockLevels, errors, timestamp: new Date().toISOString() }
}

export function getLastSync() {
  const db = getDb()
  try {
    return db.prepare(`SELECT * FROM sync_log ORDER BY id DESC LIMIT 1`).get() as Record<string, unknown> | undefined
  } catch {
    return undefined
  }
}

export function getSyncStats() {
  const db = getDb()
  try {
    const products = (db.prepare(`SELECT COUNT(*) as c FROM finale_products`).get() as { c: number }).c
    const facilities = (db.prepare(`SELECT COUNT(*) as c FROM finale_facilities`).get() as { c: number }).c
    const shipments = (db.prepare(`SELECT COUNT(*) as c FROM finale_shipments`).get() as { c: number }).c
    const orders = (db.prepare(`SELECT COUNT(*) as c FROM finale_orders`).get() as { c: number }).c
    const lastSync = getLastSync()
    return { products, facilities, shipments, orders, lastSync }
  } catch {
    return { products: 0, facilities: 0, shipments: 0, orders: 0, lastSync: undefined }
  }
}
