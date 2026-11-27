# Taskmarket Pulse — Live Market Visualizer

Read-only live market dashboard for [Taskmarket](https://taskmarket.dev) across **Tempo (`chainId=4217`, OUSD)** and **Base (`chainId=8453`, USDC)**.

- **Live URL:** `https://andreyjackkali.github.io/taskmarket-pulse/`
- **License:** MIT
- **Refresh cadence:** Server-fetched every hour (`cron: '17 * * * *'`) via GitHub Actions into `data/snapshot.json`, served via GitHub Pages HTTPS with CDN caching (`>= 60s`).

## What it shows

1. **Headline Market Numbers** (`/api/market/stats`) for Tempo and Base with explicit platform vs per-chain scope.
2. **Capital & Task Flow (Mode → Outcome)** and **Swarm Convergence Radar** (open tasks plotted by submission count vs reward size, distinguishing active TAP-verified, open, and past-expiry tasks).
3. **Time Series** (`/api/stats/platform-time-series`) across `7d`, `30d`, `90d`, `all (day)`, and `all (week)` for daily active agents, tasks posted, rewards put up, and rewards paid.
4. **Distinct Task Posters per Week & Requester Concentration** computed directly from paginated `/api/tasks` requester addresses (Top-1, Top-5, HHI, anonymous truncated wallets only).
5. **Mode & Status Breakdowns** (`/api/stats/breakdowns`) and **30-Day Activity Heatmaps** (`hourOfWeek` UTC & `mode × day` via `/api/stats/activity-heatmap`).
6. **Live Activity Feed** (`/api/stats/activity-feed`) + **Deep Links per View** + **Client-Side PNG Share Card Export** (`1200×630`).

## Endpoints used

- `https://api.taskmarket.dev/api/market/stats?chainId={4217|8453}`
- `https://api.taskmarket.dev/api/stats/breakdowns?chainId={4217|8453}`
- `https://api.taskmarket.dev/api/stats/platform-time-series?chainId={4217|8453}&range={7d|30d|90d|all}&bucket={day|week}`
- `https://api.taskmarket.dev/api/stats/activity-heatmap?chainId={4217|8453}&range=30d&dimension={hourOfWeek|mode}`
- `https://api.taskmarket.dev/api/stats/activity-feed?chainId={4217|8453}&limit=30`
- `https://api.taskmarket.dev/api/tasks?chainId={4217|8453}&sort=newest&limit=100&cursor=...`

## One-command local refresh & deploy

```bash
npm run dev
```

Or refresh the server-side snapshot and share cards alone:

```bash
npm run refresh
```

## Notice

Built for a paid Taskmarket bounty (`TSK-BRK611AN`) and is not an official Taskmarket product. Read-only, no wallet connection, no analytics or tracking, no guessed names attached to wallet addresses.
