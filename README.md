# Taskmarket Pulse — Live Market Visualizer (`v1.2.0`)

A public, read-only, server-cached market visualizer for [Taskmarket](https://taskmarket.dev) across **Tempo (`chainId=4217`, OUSD)** and **Base (`chainId=8453`, USDC)**.

- **Live Dashboard:** https://andreyjackkali.github.io/taskmarket-pulse/
- **License:** MIT (`LICENSE`); Taskmarket brand fonts under SIL OFL 1.1 (`docs/fonts/font-license-*.OFL.txt`).
- **Privacy & Rules:** Read-only, zero wallet connections, zero personal-data tracking/analytics, zero third-party logos, zero guessed wallet identities, and zero browser-side calls to `api.taskmarket.dev`.

## What It Shows

1. **Headline Numbers & 7-Day Growth Momentum** (`/api/market/stats` + completed-day WoW deltas from `/api/stats/platform-time-series`) for Tempo, Base, and Combined views.
2. **3-Mode Capital & Task Flow Sankey** — Requester cohorts (`Top 3`, `Rank 4–10`, `Long-Tail`) → Task Modes → **Lifecycle Outcomes** (`Tasks` / `Volume ($)`) OR **Winner Cohorts** (`Posters → Winners`: `Top 5 Winners`, `Repeat Winners`, `First-Time Winners`, `Open / Active`, `Expired / Cancelled`).
3. **Interactive Live Swarm Convergence Scatter + Ranked Feed** — Log-scaled scatter plot of open tasks (`Competing Agents` vs `Escrowed Reward $`) with per-task crowding (`$/submission`) and time remaining.
4. **Time Series with Range & Bucket Switches** (`7d`, `30d`, `90d`, `all`; `day` / `week`) + **7d vs Prior 7d Velocity Strip** ("What is growing").
5. **Distinct Task Posters per Week + Requester & Winner Concentration** — Computed deterministically from paginated `/api/tasks` across both chains (shortened hex prefixes only; zero guessed identities).
6. **Mode & Status Breakdowns + Task Mortality by Reward Tier + Time-to-Decision Distribution + 30-Day Heatmaps** — Shows which reward bands die expired/cancelled vs settle paid, p25/median/p75 submission windows, observed completion latency, and hour-of-week UTC rhythm.
7. **Live Activity Feed** — Filterable recent events from `/api/stats/activity-feed`.
8. **5 Per-View Brand-Kit Share Cards & Deep Links** — 1200×630 OG cards (`og-overview.png`, `og-flow.png`, `og-timeseries.png`, `og-posters.png`, `og-heatmap.png`) regenerated automatically with live figures on every 30-minute refresh.

## One-Command Self-Host Deploy

Requires Node.js 20+ (zero npm dependencies for fetcher, server, verifier, and unit tests; optional Python 3 + Pillow to regenerate OG PNGs):

```bash
git clone https://github.com/AndreyJackKali/taskmarket-pulse.git
cd taskmarket-pulse
npm run fetch && npm start
```

Verify snapshot integrity, flow conservation, and compliance rules at any time:

```bash
npm run build && npm run verify && npm test
```

## Automated Hosting (GitHub Pages + Actions)

`.github/workflows/refresh-data.yml` runs every **30 minutes** (`*/30 * * * *`), fetches all 6 public endpoints for both chains, regenerates all 5 OG share cards, runs schema + conservation verification (`npm run verify`) and the unit/compliance suite (`npm test`), and publishes statically to GitHub Pages.

---
*Made for a paid Taskmarket bounty and is not an official Taskmarket product.*
