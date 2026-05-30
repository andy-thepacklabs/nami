# Nami — Inventory Control Dashboard

Real-time inventory discrepancy detection and resolution for warehouse & fulfillment teams.

## Quick Start (same on any machine)

```bash
# 1. Install Node.js if you don't have it:
#    https://nodejs.org  (download LTS)

# 2. Install dependencies
npm install

# 3. Seed the database with schema + demo data
npm run db:migrate

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000

## Setup on a new machine

Clone (or copy) this folder, then run the three commands above.  
The database lives in `data/nami.db` — it is gitignored so each machine keeps its own local data.

## Features

| Feature | Status |
|---|---|
| Real-time discrepancy dashboard | ✅ |
| Priority + status filtering | ✅ |
| SKU / order / bin search | ✅ |
| Click-through detail modal | ✅ |
| Status / priority / assignment updates | ✅ |
| Notes & audit history | ✅ |
| Escalate / resolve workflow | ✅ |
| Daily discrepancy report | ✅ |
| Manual issue logging | ✅ |
| Auto-refresh every 30s | ✅ |

## Tech Stack

- **Next.js 14** (App Router) — frontend + API
- **SQLite via better-sqlite3** — local DB, no server needed
- **Tailwind CSS** — dark warehouse-ops theme
- **TypeScript**

## Folder structure

```
src/
  app/
    page.tsx              # Main dashboard
    layout.tsx
    globals.css
    api/
      stats/              # GET dashboard stats
      discrepancies/      # GET list, POST new
      discrepancies/[id]/ # GET detail, PATCH update
      discrepancies/[id]/notes/  # POST note
      report/             # GET daily report
  components/
    DiscrepancyModal.tsx  # Detail / edit / notes / audit
    NewDiscrepancyModal.tsx
    ReportModal.tsx
  lib/
    db.ts                 # DB connection + types
    utils.ts              # Label maps, colors, helpers
scripts/
  migrate.js              # Schema creation + seed data
data/
  nami.db                 # Created by npm run db:migrate
```
