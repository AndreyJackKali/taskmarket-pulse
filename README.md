# Taskmarket Pulse — Live Market Visualizer

A public, read-only, server-cached market visualizer for [Taskmarket](https://taskmarket.dev) across **Tempo (`chainId=4217`, OUSD)** and **Base (`chainId=8453`, USDC)**.

- **Live Dashboard:** https://andreyjackkali.github.io/taskmarket-pulse/
- **License:** MIT (`LICENSE`); Taskmarket brand fonts under SIL OFL 1.1 (`docs/fonts/font-license-*.OFL.txt`).
- **Privacy & Rules:** Read-only, zero wallet connections, zero personal-data tracking/analytics, zero third-party logos, zero guessed wallet identities, and zero browser-side calls to `api.taskmarket.dev`.

## What It Shows

1. **Headline Numbers** (`/api/market/stats`) for Tempo, Base, and Combined views.
2. **Capital & Task Flow Sankey** — Requester cohorts (`Top 3`, `Rank 4–10`, `Long-Tail`) → Task Modes → Lifecycle Outcomes (`completed`, `open`, `in_progress`, `expired`, `cancelled`), toggleable by task count or dollar volume.
3. **Live Swarm Convergence** — Open tasks ranked by competing agent submissions right now.
4. **Time Series with Range & Bucket Switches** (`7d`, `30d`, `90d`, `all`; `day` / `week`) — Daily active agents, tasks posted, rewards escrowed, and rewards paid.
5. **Distinct Task Posters per Week & Concentration** — Computed deterministically from paginated `/api/tasks` across both chains (hex prefixes only).
6. **Mode & Status Breakdowns + 30-Day Heatmaps** — Hour-of-week UTC rhythm and mode-by-day activity.
7. **Live Activity Feed** — Filterable recent events from `/api/stats/activity-feed`.
8. **Per-View Share Cards & Deep Links** — Brand-kit 1200×630 OG cards (`og-overview.png`, `og-flow.png`, `og-posters.png`, `og-heatmap.png`) regenerated automatically with live figures on every refresh.

## One-Command Self-Host Deploy

Requires Node.js 20+ (zero npm dependencies for the fetcher and server; optional Python 3 + Pillow to regenerate OG PNGs):

```bash
git clone https://github.com/AndreyJackKali/taskmarket-pulse.git
cd taskmarket-pulse
npm run fetch && npm start
```

This fetches a fresh snapshot into `docs/data/snapshot.json`, starts an HTTP server on `PORT=8088` with `Cache-Control` headers (`>= 60s`), and refreshes the snapshot server-side every 30 minutes.

## Automated Hosting (GitHub Pages + Actions)

`.github/workflows/refresh-data.yml` runs every **30 minutes** (`*/30 * * * *`), fetches all 6 public endpoints for both chains, verifies schema & integrity (`npm run verify`), regenerates the OG share cards, and publishes statically to GitHub Pages.

---
*Made for a paid Taskmarket bounty and is not an official Taskmarket product.*
