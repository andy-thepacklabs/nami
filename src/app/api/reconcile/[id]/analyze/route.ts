import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id: idStr } = await params
  const sessionId = parseInt(idStr)
  const lineId = new URL(req.url).searchParams.get('line')
  if (!lineId) return NextResponse.json({ error: 'line param required' }, { status: 400 })

  const session = db.prepare('SELECT * FROM reconcile_sessions WHERE id = ?').get(sessionId) as { bin_name: string } | undefined
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const line = db.prepare('SELECT * FROM reconcile_lines WHERE id = ? AND session_id = ?').get(parseInt(lineId), sessionId) as {
    product_id: string; product_name: string; hand_count: number; finale_qty: number; variance: number
  } | undefined
  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  const binName = session.bin_name
  const facilityRow = db.prepare('SELECT facility_url FROM finale_facilities WHERE facility_name = ?').get(binName) as { facility_url: string } | undefined
  if (!facilityRow) return NextResponse.json({ error: 'Facility not found', analysis: { reasons: ['Bin not found in Finale facilities'] } })

  const facilityUrl = facilityRow.facility_url

  // Transfers IN to this bin
  const transfersIn = db.prepare(`
    SELECT t.quantity, t.send_date, ff.facility_name AS from_name
    FROM finale_transfers t
    JOIN finale_facilities ff ON ff.facility_url = t.facility_from
    WHERE t.product_id = ? AND t.facility_to = ?
    ORDER BY t.send_date DESC
  `).all(line.product_id, facilityUrl) as { quantity: number; send_date: string; from_name: string }[]

  // Transfers OUT from this bin
  const transfersOut = db.prepare(`
    SELECT t.quantity, t.send_date, ft.facility_name AS to_name
    FROM finale_transfers t
    JOIN finale_facilities ft ON ft.facility_url = t.facility_to
    WHERE t.product_id = ? AND t.facility_from = ?
    ORDER BY t.send_date DESC
  `).all(line.product_id, facilityUrl) as { quantity: number; send_date: string; to_name: string }[]

  // Builds consumed
  const consumed = db.prepare(`
    SELECT bl.quantity, b.complete_date, b.work_effort_id
    FROM finale_build_lines bl
    JOIN finale_builds b ON b.work_effort_id = bl.work_effort_id
    WHERE bl.product_id = ? AND bl.facility_url = ? AND bl.line_type = 'consume'
    ORDER BY b.complete_date DESC
  `).all(line.product_id, facilityUrl) as { quantity: number; complete_date: string; work_effort_id: string }[]

  // Builds produced
  const produced = db.prepare(`
    SELECT bl.quantity, b.complete_date, b.work_effort_id
    FROM finale_build_lines bl
    JOIN finale_builds b ON b.work_effort_id = bl.work_effort_id
    WHERE bl.product_id = ? AND bl.facility_url = ? AND bl.line_type = 'produce'
    ORDER BY b.complete_date DESC
  `).all(line.product_id, facilityUrl) as { quantity: number; complete_date: string; work_effort_id: string }[]

  // Check for duplicates
  const duplicates = db.prepare(`
    SELECT t.product_id, t.quantity, t.send_date, COUNT(*) AS cnt
    FROM finale_transfers t
    WHERE t.product_id = ? AND (t.facility_to = ? OR t.facility_from = ?)
    GROUP BY t.product_id, t.quantity, t.facility_from, t.facility_to, t.send_date
    HAVING cnt > 1
  `).all(line.product_id, facilityUrl, facilityUrl) as { quantity: number; send_date: string; cnt: number }[]

  // Check if transfers come from inactive facilities
  const fromInactive = db.prepare(`
    SELECT t.quantity, t.send_date, ff.facility_name, ff.status
    FROM finale_transfers t
    JOIN finale_facilities ff ON ff.facility_url = t.facility_from
    WHERE t.product_id = ? AND t.facility_to = ? AND ff.status = 'FACILITY_INACTIVE'
  `).all(line.product_id, facilityUrl) as { quantity: number; send_date: string; facility_name: string }[]

  // Compute totals
  const totalIn = transfersIn.reduce((s, t) => s + t.quantity, 0)
  const totalOut = transfersOut.reduce((s, t) => s + t.quantity, 0)
  const totalConsumed = consumed.reduce((s, c) => s + c.quantity, 0)
  const totalProduced = produced.reduce((s, p) => s + p.quantity, 0)
  const computedNet = totalIn - totalOut - totalConsumed + totalProduced
  const duplicateImpact = duplicates.reduce((s, d) => s + d.quantity * (d.cnt - 1), 0)
  const inactiveSourceQty = fromInactive.reduce((s, f) => s + f.quantity, 0)

  // Build human-readable reasons
  const reasons: string[] = []

  if (line.variance === 0) {
    reasons.push('Hand count matches Finale. No variance to investigate.')
  } else {
    reasons.push(`Finale computes ${line.finale_qty} from: ${Math.round(totalIn)} transferred in, ${Math.round(totalOut)} transferred out, ${Math.round(totalConsumed)} consumed in builds, ${Math.round(totalProduced)} produced in builds.`)

    if (duplicates.length > 0) {
      reasons.push(`Found ${duplicates.length} duplicate transfer entries impacting ${Math.round(duplicateImpact)} units. These may be inflating or deflating Finale's count.`)
    }

    if (fromInactive.length > 0) {
      reasons.push(`${Math.round(inactiveSourceQty)} units came from ${fromInactive.length} transfers originating at deactivated bins. This data may be unreliable.`)
    }

    if (totalConsumed > 0 && totalIn === 0) {
      reasons.push(`Product was consumed in ${consumed.length} builds but has no transfer history into this bin. It was likely received via purchase orders (not visible in current API).`)
    }

    if (line.hand_count > 0 && line.finale_qty <= 0) {
      reasons.push(`You counted ${line.hand_count} on the shelf but Finale shows ${line.finale_qty}. Finale may be missing inbound receiving data, or the product was placed here without a transfer being logged.`)
    }

    if (line.hand_count === 0 && line.finale_qty > 0) {
      reasons.push(`Finale thinks ${line.finale_qty} should be here but the shelf is empty. Product may have been moved without logging a transfer, or shipped out without the system being updated.`)
    }

    if (line.hand_count > 0 && line.finale_qty > 0 && line.variance !== 0) {
      const pct = Math.round(Math.abs(line.variance) / line.finale_qty * 100)
      if (pct < 5) {
        reasons.push(`Variance is ${pct}% — this could be a counting error or minor shrinkage.`)
      } else if (pct < 20) {
        reasons.push(`Variance is ${pct}% — likely a missed transfer or partial shipment not recorded.`)
      } else {
        reasons.push(`Variance is ${pct}% — significant gap. Check for unlogged transfers, miscounts, or wrong-bin placements.`)
      }
    }
  }

  return NextResponse.json({
    line,
    analysis: {
      reasons,
      breakdown: {
        transfersIn: Math.round(totalIn),
        transfersOut: Math.round(totalOut),
        buildsConsumed: Math.round(totalConsumed),
        buildsProduced: Math.round(totalProduced),
        computedNet: Math.round(computedNet),
        duplicateImpact: Math.round(duplicateImpact),
        inactiveSourceQty: Math.round(inactiveSourceQty),
      },
      recentTransfersIn: transfersIn.slice(0, 10),
      recentTransfersOut: transfersOut.slice(0, 10),
      recentBuilds: consumed.slice(0, 5),
      duplicates,
      fromInactive: fromInactive.slice(0, 5),
    },
  })
}
