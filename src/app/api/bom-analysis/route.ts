import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getDb()

    // Ensure tables exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS bom_products (
        product_id      TEXT PRIMARY KEY,
        product_name    TEXT,
        status_id       TEXT,
        expand_policy   TEXT,
        bom_child_count INTEGER NOT NULL DEFAULT 0,
        synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM bom_products`).get() as { n: number }).n
    if (total === 0) {
      return NextResponse.json({ synced: false, total: 0, issues: [], summary: null })
    }

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN expand_policy = '##expand'   THEN 1 ELSE 0 END) AS expand_count,
        SUM(CASE WHEN expand_policy = '##noexpand' THEN 1 ELSE 0 END) AS noexpand_count,
        SUM(CASE WHEN COALESCE(expand_policy,'') = '' THEN 1 ELSE 0 END) AS blank_count,
        SUM(CASE WHEN bom_child_count > 0 THEN 1 ELSE 0 END) AS has_bom_count
      FROM bom_products
    `).get()

    // Issue 1: ##expand but no BOM children (policy says "expand" but nothing to expand)
    const expandNoBom = db.prepare(`
      SELECT product_id, product_name, status_id, expand_policy, bom_child_count
      FROM bom_products
      WHERE expand_policy = '##expand' AND bom_child_count = 0
      ORDER BY product_id
    `).all()

    // Issue 2: ##noexpand but HAS BOM children (contradictory)
    const noexpandWithBom = db.prepare(`
      SELECT product_id, product_name, status_id, expand_policy, bom_child_count
      FROM bom_products
      WHERE expand_policy = '##noexpand' AND bom_child_count > 0
      ORDER BY bom_child_count DESC
    `).all()

    // Issue 3: blank policy but HAS BOM children (untagged assemblies — silent risk)
    const blankWithBom = db.prepare(`
      SELECT product_id, product_name, status_id, expand_policy, bom_child_count
      FROM bom_products
      WHERE COALESCE(expand_policy,'') = '' AND bom_child_count > 0
      ORDER BY bom_child_count DESC
    `).all()

    // Healthy: ##expand WITH children
    const healthyExpand = db.prepare(`
      SELECT COUNT(*) AS n FROM bom_products WHERE expand_policy = '##expand' AND bom_child_count > 0
    `).get() as { n: number }

    // Healthy: ##noexpand with no children (correct purchased-item tag)
    const healthyNoexpand = db.prepare(`
      SELECT COUNT(*) AS n FROM bom_products WHERE expand_policy = '##noexpand' AND bom_child_count = 0
    `).get() as { n: number }

    return NextResponse.json({
      synced: true,
      summary,
      healthy: {
        expandWithBom:    healthyExpand.n,
        noexpandNoBom:    healthyNoexpand.n,
      },
      issues: {
        expandNoBom:      { count: expandNoBom.length,      rows: expandNoBom },
        noexpandWithBom:  { count: noexpandWithBom.length,  rows: noexpandWithBom },
        blankWithBom:     { count: blankWithBom.length,     rows: blankWithBom },
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
