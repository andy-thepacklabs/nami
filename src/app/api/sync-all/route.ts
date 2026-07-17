import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface SyncJob {
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  error?: string
  startedAt?: number
  doneAt?: number
}

const state = {
  running: false,
  jobs: [] as SyncJob[],
  startedAt: null as number | null,
  doneAt: null as number | null,
}

async function runAll(origin: string) {
  state.running = true
  state.startedAt = Date.now()
  state.doneAt = null
  state.jobs = [
    { name: 'Finale Inventory', status: 'pending' },
    { name: 'Shipped Sales', status: 'pending' },
    { name: 'Shipped By Product', status: 'pending' },
    { name: 'Commit Sales', status: 'pending' },
    { name: 'Spending', status: 'pending' },
  ]

  const endpoints = [
    { idx: 0, url: `${origin}/api/finale/sync`, method: 'POST', body: undefined },
    { idx: 1, url: `${origin}/api/shipped-sales-sync`, method: 'POST', body: JSON.stringify({}) },
    { idx: 2, url: `${origin}/api/shipped-sales-by-product-sync`, method: 'POST', body: JSON.stringify({}) },
    { idx: 3, url: `${origin}/api/commit-sales-sync`, method: 'POST', body: JSON.stringify({}) },
    { idx: 4, url: `${origin}/api/spending-sync`, method: 'POST', body: JSON.stringify({}) },
  ]

  const runJob = async (ep: typeof endpoints[0]) => {
    const job = state.jobs[ep.idx]
    job.status = 'running'
    job.startedAt = Date.now()
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body,
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)

      // For async syncs (shipped, commit, spending), poll until done
      const asyncSyncs: Record<number, string> = {
        1: `${origin}/api/shipped-sales-sync`,
        2: `${origin}/api/shipped-sales-by-product-sync`,
        3: `${origin}/api/commit-sales-sync`,
        4: `${origin}/api/spending-sync`,
      }
      const pollUrl = asyncSyncs[ep.idx]
      if (pollUrl) {
        let attempts = 0
        while (attempts < 120) {
          await new Promise(r => setTimeout(r, 2000))
          const p = await fetch(pollUrl).then(r => r.json())
          if (p.status === 'done' || p.status === 'idle') break
          if (p.status === 'error') throw new Error(p.error || 'Sync failed')
          attempts++
        }
      }

      job.status = 'done'
      job.doneAt = Date.now()
    } catch (err) {
      job.status = 'error'
      job.error = String(err)
      job.doneAt = Date.now()
    }
  }

  // Run Finale sync first (other syncs depend on stock data), then the rest in parallel
  await runJob(endpoints[0])
  await Promise.all(endpoints.slice(1).map(runJob))

  state.running = false
  state.doneAt = Date.now()
}

export async function POST(req: Request) {
  if (state.running) return NextResponse.json({ started: false, reason: 'already running', ...state })

  const url = new URL(req.url)
  const origin = url.origin

  runAll(origin).catch(() => { state.running = false })
  return NextResponse.json({ started: true })
}

export async function GET() {
  return NextResponse.json(state)
}
