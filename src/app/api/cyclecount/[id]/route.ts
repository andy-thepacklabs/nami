import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: get a cycle count with all lines
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const count = db.prepare('SELECT * FROM cycle_counts WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lines = db.prepare('SELECT * FROM cycle_count_lines WHERE count_id = ? ORDER BY product_name, product_id').all(id)

  // Get previous trusted inventory for this bin (for follow-up comparison)
  const trusted = db.prepare('SELECT * FROM trusted_inventory WHERE bin_name = ? ORDER BY product_id').all(count.bin_name as string) as {
    product_id: string; quantity: number; established_at: string; verify_count: number
  }[]

  // Get Finale's computed stock for this bin
  const finaleStock = db.prepare(`
    SELECT cs.product_id, cs.product_name, cs.net_qty
    FROM computed_stock cs
    WHERE cs.facility_name = ?
    ORDER BY cs.product_name
  `).all(count.bin_name as string) as { product_id: string; product_name: string; net_qty: number }[]

  return NextResponse.json({ count, lines, trusted, finaleStock })
}

// PATCH: add/update lines or complete the count
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()

  const count = db.prepare('SELECT * FROM cycle_counts WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Add a line item
  if (body.action === 'add_line') {
    const { product_id, product_name, quantity, notes } = body
    if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })

    // Upsert — if product already in this count, update it
    const existing = db.prepare('SELECT id FROM cycle_count_lines WHERE count_id = ? AND product_id = ?').get(id, product_id)
    if (existing) {
      db.prepare('UPDATE cycle_count_lines SET quantity = ?, notes = ?, product_name = COALESCE(?, product_name) WHERE count_id = ? AND product_id = ?')
        .run(Number(quantity ?? 0), notes ?? null, product_name ?? null, id, product_id)
    } else {
      db.prepare('INSERT INTO cycle_count_lines (count_id, product_id, product_name, quantity, notes) VALUES (?, ?, ?, ?, ?)')
        .run(id, product_id, product_name ?? null, Number(quantity ?? 0), notes ?? null)
    }
    return NextResponse.json({ ok: true })
  }

  // Bulk add lines
  if (body.action === 'bulk_add') {
    const { lines } = body as { lines: { product_id: string; product_name?: string; quantity: number; notes?: string }[] }
    for (const l of lines) {
      const existing = db.prepare('SELECT id FROM cycle_count_lines WHERE count_id = ? AND product_id = ?').get(id, l.product_id)
      if (existing) {
        db.prepare('UPDATE cycle_count_lines SET quantity = ?, notes = ?, product_name = COALESCE(?, product_name) WHERE count_id = ? AND product_id = ?')
          .run(Number(l.quantity ?? 0), l.notes ?? null, l.product_name ?? null, id, l.product_id)
      } else {
        db.prepare('INSERT INTO cycle_count_lines (count_id, product_id, product_name, quantity, notes) VALUES (?, ?, ?, ?, ?)')
          .run(id, l.product_id, l.product_name ?? null, Number(l.quantity ?? 0), l.notes ?? null)
      }
    }
    return NextResponse.json({ ok: true, added: lines.length })
  }

  // Complete the count — save lines as trusted inventory
  if (body.action === 'complete') {
    const lines = db.prepare('SELECT * FROM cycle_count_lines WHERE count_id = ?').all(id) as {
      product_id: string; product_name: string; quantity: number
    }[]

    const binName = count.bin_name as string
    const countedBy = count.counted_by as string
    const countType = count.count_type as string

    for (const line of lines) {
      const existing = db.prepare('SELECT * FROM trusted_inventory WHERE product_id = ? AND bin_name = ?')
        .get(line.product_id, binName) as { verify_count: number } | undefined

      if (existing) {
        if (countType === 'follow_up') {
          // Follow-up: increment verify count, update last_verified
          db.prepare(`
            UPDATE trusted_inventory
            SET quantity = ?, counted_by = ?, last_verified = datetime('now'),
                verify_count = verify_count + 1, count_id = ?
            WHERE product_id = ? AND bin_name = ?
          `).run(line.quantity, countedBy, id, line.product_id, binName)
        } else {
          // Hard count: reset as new baseline
          db.prepare(`
            UPDATE trusted_inventory
            SET quantity = ?, counted_by = ?, established_at = datetime('now'),
                last_verified = NULL, verify_count = 1, count_id = ?
            WHERE product_id = ? AND bin_name = ?
          `).run(line.quantity, countedBy, id, line.product_id, binName)
        }
      } else {
        db.prepare(`
          INSERT INTO trusted_inventory (product_id, bin_name, quantity, counted_by, count_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(line.product_id, binName, line.quantity, countedBy, id)
      }
    }

    // Remove trusted inventory for products NOT in this count (they're gone from the bin)
    if (countType === 'hard_count') {
      const countedProducts = lines.map(l => l.product_id)
      if (countedProducts.length > 0) {
        const existing = db.prepare('SELECT product_id FROM trusted_inventory WHERE bin_name = ?')
          .all(binName) as { product_id: string }[]
        for (const e of existing) {
          if (!countedProducts.includes(e.product_id)) {
            db.prepare('DELETE FROM trusted_inventory WHERE product_id = ? AND bin_name = ?')
              .run(e.product_id, binName)
          }
        }
      }
    }

    db.prepare("UPDATE cycle_counts SET status = 'completed', completed_at = datetime('now'), notes = ? WHERE id = ?")
      .run(body.notes ?? null, id)

    return NextResponse.json({ ok: true, trustedProducts: lines.length })
  }

  // Delete a line
  if (body.action === 'delete_line') {
    db.prepare('DELETE FROM cycle_count_lines WHERE id = ? AND count_id = ?').run(body.line_id, id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
