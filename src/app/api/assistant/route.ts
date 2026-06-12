import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function safeQuery<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

function gatherContext(): string {
  const db = getDb()

  const stats = safeQuery(() => db.prepare(`
    SELECT
      COUNT(DISTINCT product_id) AS total_skus,
      SUM(qoh) AS total_units,
      COUNT(DISTINCT CASE WHEN qoh <= 0 THEN product_id END) AS out_of_stock
    FROM finale_stock_csv
  `).get() as { total_skus: number; total_units: number; out_of_stock: number }, null)

  const byCategory = safeQuery(() => db.prepare(`
    SELECT category, COUNT(DISTINCT product_id) AS skus, SUM(qoh) AS units
    FROM finale_stock_csv
    WHERE qoh > 0
    GROUP BY category
    ORDER BY units DESC
  `).all() as { category: string; skus: number; units: number }[], [])

  const lowStock = safeQuery(() => db.prepare(`
    SELECT s.product_id, s.product_name, s.category,
           SUM(s.qoh) AS qoh,
           ROUND(SUM(s.qoh) / (c.quantity / 3.0), 2) AS mo_on_hand
    FROM finale_stock_csv s
    JOIN finale_consumed_90d c ON c.product_id = s.product_id
    WHERE c.quantity > 0
    GROUP BY s.product_id
    HAVING mo_on_hand < 2
    ORDER BY mo_on_hand ASC
    LIMIT 20
  `).all() as { product_id: string; product_name: string | null; category: string | null; qoh: number; mo_on_hand: number }[], [])

  const topSelling = safeQuery(() => db.prepare(`
    SELECT product_id, product_name, category, sales_7d, sales_30d, sales_90d
    FROM finale_sales_csv
    WHERE sales_90d > 0
    ORDER BY sales_90d DESC
    LIMIT 20
  `).all() as { product_id: string; product_name: string | null; category: string | null; sales_7d: number; sales_30d: number; sales_90d: number }[], [])

  const topConsumed = safeQuery(() => db.prepare(`
    SELECT c.product_id, s.product_name, s.category, c.quantity AS consumed_90d
    FROM finale_consumed_90d c
    LEFT JOIN (SELECT product_id, product_name, category FROM finale_stock_csv GROUP BY product_id) s
      ON s.product_id = c.product_id
    WHERE c.quantity > 0
    ORDER BY c.quantity DESC
    LIMIT 20
  `).all() as { product_id: string; product_name: string | null; category: string | null; consumed_90d: number }[], [])

  const lastImport = safeQuery(() => {
    const r = db.prepare(`SELECT imported_at FROM finale_stock_csv ORDER BY rowid DESC LIMIT 1`).get() as { imported_at: string } | undefined
    return r?.imported_at ?? null
  }, null)

  const lines: string[] = [
    `=== NAMI INVENTORY ASSISTANT CONTEXT ===`,
    `Last Finale sync: ${lastImport ?? 'Unknown'}`,
    ``,
    `--- OVERVIEW ---`,
    stats ? `Total SKUs: ${stats.total_skus} | Total units on hand: ${stats.total_units?.toLocaleString()} | Out of stock SKUs: ${stats.out_of_stock}` : 'Stats unavailable',
    ``,
    `--- INVENTORY BY CATEGORY ---`,
    ...byCategory.map(c => `${c.category}: ${c.skus} SKUs, ${Math.round(c.units).toLocaleString()} units`),
    ``,
    `--- LOW STOCK (< 2 months on hand) ---`,
    lowStock.length === 0 ? 'None' : lowStock.map(r =>
      `${r.product_id} | ${r.product_name ?? ''} | ${r.category ?? ''} | QoH: ${r.qoh} | MoH: ${r.mo_on_hand}`
    ).join('\n'),
    ``,
    `--- TOP 20 SELLING SKUs (by 90d sales) ---`,
    topSelling.length === 0 ? 'No sales data' : topSelling.map((r, i) =>
      `${i + 1}. ${r.product_id} | ${r.product_name ?? ''} | ${r.category ?? ''} | 7d: ${r.sales_7d} | 30d: ${r.sales_30d} | 90d: ${r.sales_90d}`
    ).join('\n'),
    ``,
    `--- TOP 20 CONSUMED SKUs (last 90 days) ---`,
    topConsumed.length === 0 ? 'No consumption data' : topConsumed.map((r, i) =>
      `${i + 1}. ${r.product_id} | ${r.product_name ?? ''} | ${r.category ?? ''} | Consumed 90d: ${r.consumed_90d}`
    ).join('\n'),
  ]

  return lines.join('\n')
}

export async function POST(req: Request) {
  const { messages } = await req.json() as { messages: { role: 'user' | 'assistant'; content: string }[] }

  if (!messages?.length) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in .env' }, { status: 500 })
  }

  const context = gatherContext()
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are Nami, an intelligent inventory assistant for The Pack Labs. You help the team understand their inventory, sales, and stock levels.

Answer questions concisely and clearly. Use the live data below from the Finale inventory database. Format numbers with commas. When listing items, use bullet points. Be direct and data-driven.

${context}`,
    messages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ reply: text })
}
