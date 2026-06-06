const BASE_URL = 'https://app.finaleinventory.com'

function getAccount() {
  return process.env.FINALE_ACCOUNT || ''
}

function getAuthHeader() {
  const user = process.env.FINALE_USERNAME || ''
  const pass = process.env.FINALE_PASSWORD || ''
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

function apiBase() {
  return `${BASE_URL}/${getAccount()}/api`
}

export async function finaleGet<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${apiBase()}/${endpoint}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'User-Agent': 'Nami-Inventory/1.0',
    },
  })

  if (!res.ok) throw new Error(`Finale GET ${endpoint}: ${res.status} ${res.statusText}`)
  return res.json()
}

// Finale returns columnar data: { key1: [val, val, ...], key2: [val, val, ...] }
// This converts to row-based: [{ key1: val, key2: val }, ...]
export function columnarToRows<T = Record<string, unknown>>(data: Record<string, unknown[]>): T[] {
  const keys = Object.keys(data)
  if (keys.length === 0) return []

  const len = (data[keys[0]] as unknown[])?.length ?? 0
  const rows: T[] = []

  for (let i = 0; i < len; i++) {
    const row: Record<string, unknown> = {}
    for (const key of keys) {
      const arr = data[key] as unknown[]
      row[key] = arr ? arr[i] : null
    }
    rows.push(row as T)
  }

  return rows
}

// ── Typed response shapes ──

export interface FinaleProduct {
  productId: string
  productUrl: string
  internalName: string
  statusId: string
  productTypeId?: string
  containerId?: string
  universalProductCode?: string
  cost?: number
  category?: string
  lastUpdatedDate?: string
  createdDate?: string
  [key: string]: unknown
}

export interface FinaleFacility {
  facilityId: string
  facilityUrl: string
  facilityName: string
  facilityTypeId?: string
  parentFacilityUrl?: string
  statusId?: string
  [key: string]: unknown
}

export interface FinaleShipment {
  shipmentId: string
  shipmentUrl: string
  statusId: string
  orderUrl?: string
  facilityUrl?: string
  shipmentTypeId?: string
  shipDate?: string
  [key: string]: unknown
}

export interface FinaleOrder {
  orderId: string
  orderUrl: string
  statusId: string
  orderTypeId?: string
  orderDate?: string
  [key: string]: unknown
}

// ── High-level fetch helpers ──

export async function fetchProducts(): Promise<FinaleProduct[]> {
  const data = await finaleGet<Record<string, unknown[]>>('product')
  return columnarToRows<FinaleProduct>(data)
}

export async function fetchFacilities(): Promise<FinaleFacility[]> {
  const data = await finaleGet<Record<string, unknown[]>>('facility')
  return columnarToRows<FinaleFacility>(data)
}

export async function fetchShipments(): Promise<FinaleShipment[]> {
  const data = await finaleGet<Record<string, unknown[]>>('shipment')
  return columnarToRows<FinaleShipment>(data)
}

export async function fetchOrders(): Promise<FinaleOrder[]> {
  const data = await finaleGet<Record<string, unknown[]>>('order')
  return columnarToRows<FinaleOrder>(data)
}

export interface FinaleWorkEffort {
  workEffortId: string
  workEffortUrl: string
  workEffortTypeId: string
  statusId: string
  facilityUrl: string
  productIdToProduce: string
  productUrlToProduce: string
  quantityToProduce: number
  completeDate: string | null
  startDate: string | null
  description: string | null
  lotIdToProduce: string | null
  workEffortConsumeList: { facilityUrl: string; productId: string; productUrl: string; quantity: number }[] | null
  workEffortProduceList: { facilityUrl: string; productId: string; productUrl: string; quantity: number }[] | null
  [key: string]: unknown
}

export async function fetchWorkEfforts(): Promise<FinaleWorkEffort[]> {
  const data = await finaleGet<Record<string, unknown[]>>('workeffort')
  return columnarToRows<FinaleWorkEffort>(data)
}

export interface FinaleTransfer {
  inventoryTransferUrl: string
  productId: string
  productUrl: string
  quantity: number
  facilityUrlFrom: string
  facilityUrlTo: string
  sendDate: string
  receiveDate: string
  lastUpdatedDate: string
  generalComments: string
  lotId: string | null
  [key: string]: unknown
}

export async function fetchTransfers(): Promise<FinaleTransfer[]> {
  const data = await finaleGet<Record<string, unknown[]>>('inventorytransfer')
  return columnarToRows<FinaleTransfer>(data)
}

export interface FinaleInventoryLevel {
  productId: string
  productUrl: string
  facilityUrl: string
  qtyOnHand: number
  qtyAvailable: number
  qtyReserved: number
  [key: string]: unknown
}

export async function fetchInventoryLevels(): Promise<FinaleInventoryLevel[]> {
  const data = await finaleGet<Record<string, unknown[]>>('inventorylevel')
  return columnarToRows<FinaleInventoryLevel>(data)
}

// ── Connection test ──

export async function testConnection(): Promise<{ ok: boolean; account: string; productCount?: number; facilityCount?: number; error?: string }> {
  try {
    const products = await fetchProducts()
    const facilities = await fetchFacilities()
    return {
      ok: true,
      account: getAccount(),
      productCount: products.length,
      facilityCount: facilities.length,
    }
  } catch (err) {
    return { ok: false, account: getAccount(), error: (err as Error).message }
  }
}
