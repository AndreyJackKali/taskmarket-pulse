#!/usr/bin/env node
/**
 * Taskmarket Pulse — Server-Side Snapshot Fetcher
 * Fetches live market data from https://api.taskmarket.dev for Tempo (4217) and Base (8453),
 * computes reproducible analytics (distinct posters/week, concentration, flow, swarm convergence),
 * and writes docs/data/snapshot.json. Zero external dependencies (Node 20+).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "docs", "data", "snapshot.json");
const BASE_URL = "https://api.taskmarket.dev";

const CHAINS = [
  { id: 4217, key: "tempo", name: "Tempo", token: "OUSD", decimals: 6 },
  { id: 8453, key: "base", name: "Base", token: "USDC", decimals: 6 },
];

async function fetchJson(ep) {
  const url = `${BASE_URL}${ep}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "taskmarket-pulse/1.0 (+https://github.com/AndreyJackKali/taskmarket-pulse)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${ep}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
}

async function fetchAllTasks(chainId, maxPages = 40) {
  const all = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const qs = cursor
      ? `/api/tasks?chainId=${chainId}&sort=newest&limit=100&cursor=${encodeURIComponent(cursor)}`
      : `/api/tasks?chainId=${chainId}&sort=newest&limit=100`;
    const data = await fetchJson(qs);
    const batch = Array.isArray(data.tasks) ? data.tasks : [];
    let added = 0;
    for (const t of batch) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        all.push(t);
        added++;
      }
    }
    if (!data.hasMore || !data.nextCursor || added === 0) break;
    cursor = data.nextCursor;
  }
  return all;
}

function isoWeekKey(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7; // Mon=1..Sun=7
  utc.setUTCDate(utc.getUTCDate() - day + 1); // Monday of ISO week
  const weekStart = utc.toISOString().slice(0, 10);
  // ISO week number
  const thurs = new Date(utc);
  thurs.setUTCDate(thurs.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thurs.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((thurs - yearStart) / 86400000 + 1) / 7);
  return { weekStart, isoWeek: `${thurs.getUTCFullYear()}-W${String(wk).padStart(2, "0")}` };
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || "unknown";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function toUsd(baseUnits) {
  const n = Number(baseUnits || 0);
  return Number.isFinite(n) ? n / 1e6 : 0;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function computeTaskAnalytics(tasks) {
  const weeklyMap = new Map();
  const posterCounts = new Map();
  const posterVol = new Map();
  const modeStatusCount = new Map();
  const modeStatusVol = new Map();
  const lifespanHours = [];
  const rewards = [];
  const openSwarm = [];
  let completedCount = 0;
  let deadCount = 0; // expired + cancelled
  let totalRewardUsd = 0;

  for (const t of tasks) {
    const req = (t.requester || "").toLowerCase();
    const reward = toUsd(t.reward);
    totalRewardUsd += reward;
    if (reward > 0) rewards.push(reward);

    if (req) {
      posterCounts.set(req, (posterCounts.get(req) || 0) + 1);
      posterVol.set(req, (posterVol.get(req) || 0) + reward);
    }

    const wk = isoWeekKey(t.createdAt);
    if (wk) {
      if (!weeklyMap.has(wk.weekStart)) {
        weeklyMap.set(wk.weekStart, {
          weekStart: wk.weekStart,
          isoWeek: wk.isoWeek,
          posters: new Set(),
          tasks: 0,
          rewardUsd: 0,
          completed: 0,
        });
      }
      const row = weeklyMap.get(wk.weekStart);
      if (req) row.posters.add(req);
      row.tasks += 1;
      row.rewardUsd += reward;
      if (t.status === "completed") row.completed += 1;
    }

    const mode = t.mode || "bounty";
    const status = t.status || "open";
    const bucketStatus =
      status === "completed"
        ? "completed"
        : status === "open"
        ? "open"
        : status === "expired"
        ? "expired"
        : status === "cancelled"
        ? "cancelled"
        : "in_progress";

    if (status === "completed") completedCount++;
    if (status === "expired" || status === "cancelled") deadCount++;

    const msKey = `${mode}::${bucketStatus}`;
    modeStatusCount.set(msKey, (modeStatusCount.get(msKey) || 0) + 1);
    modeStatusVol.set(msKey, (modeStatusVol.get(msKey) || 0) + reward);

    if (t.createdAt && t.expiryTime) {
      const hrs = (new Date(t.expiryTime) - new Date(t.createdAt)) / 3600000;
      if (hrs > 0 && hrs < 24 * 120) lifespanHours.push(hrs);
    }

    if (status === "open") {
      const titleLine = String(t.description || "").split("\n")[0].trim().slice(0, 96);
      openSwarm.push({
        ref: t.referenceCode || t.id.slice(0, 10),
        id: t.id,
        title: titleLine || t.referenceCode || "Untitled task",
        mode,
        rewardUsd: Number(reward.toFixed(2)),
        submissions: Number(t.submissionCount || 0),
        requesterShort: shortAddr(t.requester),
        createdAt: t.createdAt,
        expiryTime: t.expiryTime,
        verifiedRequired: Array.isArray(t.verifiedBy) && t.verifiedBy.length > 0,
      });
    }
  }

  // Weekly distinct posters sorted ascending
  const distinctPostersByWeek = [...weeklyMap.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({
      weekStart: w.weekStart,
      isoWeek: w.isoWeek,
      distinctPosters: w.posters.size,
      tasks: w.tasks,
      rewardUsd: Number(w.rewardUsd.toFixed(2)),
      completed: w.completed,
    }));

  // Poster concentration (strictly shortened hex, zero guessed identities)
  const postersSorted = [...posterCounts.entries()]
    .map(([addr, count]) => ({
      walletShort: shortAddr(addr),
      tasks: count,
      rewardUsd: Number((posterVol.get(addr) || 0).toFixed(2)),
    }))
    .sort((a, b) => b.tasks - a.tasks || b.rewardUsd - a.rewardUsd);

  const totalTasks = tasks.length || 1;
  const top3Tasks = postersSorted.slice(0, 3).reduce((s, x) => s + x.tasks, 0);
  const top5Tasks = postersSorted.slice(0, 5).reduce((s, x) => s + x.tasks, 0);
  const top10Tasks = postersSorted.slice(0, 10).reduce((s, x) => s + x.tasks, 0);
  const repeatPosters = postersSorted.filter((x) => x.tasks >= 2).length;
  const oneOffPosters = postersSorted.filter((x) => x.tasks === 1).length;

  // Cohort -> Mode -> Outcome flow edges for Sankey
  const top3Set = new Set([...posterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]));
  const top10Set = new Set([...posterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]));
  const cohortToMode = new Map();
  for (const t of tasks) {
    const req = (t.requester || "").toLowerCase();
    const cohort = top3Set.has(req) ? "Top 3 Posters" : top10Set.has(req) ? "Rank 4–10 Posters" : "Long-Tail Posters";
    const mode = t.mode || "bounty";
    const k = `${cohort}::${mode}`;
    const prev = cohortToMode.get(k) || { tasks: 0, rewardUsd: 0 };
    prev.tasks += 1;
    prev.rewardUsd += toUsd(t.reward);
    cohortToMode.set(k, prev);
  }

  const flowLinksCohortMode = [...cohortToMode.entries()].map(([k, v]) => {
    const [source, target] = k.split("::");
    return { source, target, tasks: v.tasks, rewardUsd: Number(v.rewardUsd.toFixed(2)) };
  });
  const flowLinksModeStatus = [...modeStatusCount.entries()].map(([k, cnt]) => {
    const [source, target] = k.split("::");
    return { source, target, tasks: cnt, rewardUsd: Number((modeStatusVol.get(k) || 0).toFixed(2)) };
  });

  // Top live swarm convergence (open tasks with highest submissions)
  openSwarm.sort((a, b) => b.submissions - a.submissions || b.rewardUsd - a.rewardUsd);

  return {
    indexedTasksCount: tasks.length,
    distinctPostersTotal: postersSorted.length,
    repeatPosters,
    oneOffPosters,
    top3SharePct: Number(((top3Tasks / totalTasks) * 100).toFixed(1)),
    top5SharePct: Number(((top5Tasks / totalTasks) * 100).toFixed(1)),
    top10SharePct: Number(((top10Tasks / totalTasks) * 100).toFixed(1)),
    completionRatePct: Number(((completedCount / totalTasks) * 100).toFixed(1)),
    mortalityRatePct: Number(((deadCount / totalTasks) * 100).toFixed(1)),
    medianRewardUsd: Number(median(rewards).toFixed(2)),
    medianWindowHours: Number(median(lifespanHours).toFixed(1)),
    indexedRewardVolumeUsd: Number(totalRewardUsd.toFixed(2)),
    distinctPostersByWeek,
    topPosters: postersSorted.slice(0, 12),
    flow: {
      cohortToMode: flowLinksCohortMode,
      modeToStatus: flowLinksModeStatus,
    },
    swarmConvergence: openSwarm.slice(0, 18),
  };
}

async function fetchChain(chain) {
  const cid = chain.id;
  console.log(`[fetch] Chain ${chain.name} (${cid})...`);
  const [
    headline,
    breakdowns,
    ts7dDay,
    ts30dDay,
    ts90dDay,
    ts90dWeek,
    tsAllDay,
    tsAllWeek,
    heatmapHour,
    heatmapMode,
    feed,
    allTasks,
  ] = await Promise.all([
    fetchJson(`/api/market/stats?chainId=${cid}`),
    fetchJson(`/api/stats/breakdowns?chainId=${cid}`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=7d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=30d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=90d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=90d&bucket=week`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=all&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=all&bucket=week`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=hourOfWeek`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=mode`),
    fetchJson(`/api/stats/activity-feed?chainId=${cid}&limit=40`),
    fetchAllTasks(cid, 40),
  ]);

  const analytics = computeTaskAnalytics(allTasks);
  // Sanitize activity feed: keep only public fields, shortened wallet hex, never guessed identities
  const cleanFeed = (feed.items || []).map((item) => ({
    type: item.type,
    timestamp: item.timestamp,
    taskId: item.taskId,
    taskTitle: String(item.taskTitle || "").slice(0, 110),
    chainId: item.chainId,
    actorShort: shortAddr(item.actor),
    actorType: item.actorType || "unknown",
    actorAgentId: item.actorAgentId || null,
    amountUsd: item.amount ? Number((Number(item.amount) / 1e6).toFixed(4)) : null,
    rating: item.rating ?? null,
  }));

  console.log(
    `[ok] ${chain.name}: open=${headline.openTasks}, paidWorkers=${headline.paidWorkers}, indexedTasks=${allTasks.length}, distinctPosters=${analytics.distinctPostersTotal}`
  );

  return {
    meta: chain,
    headline,
    breakdowns,
    timeSeries: {
      "7d_day": ts7dDay,
      "30d_day": ts30dDay,
      "90d_day": ts90dDay,
      "90d_week": ts90dWeek,
      "all_day": tsAllDay,
      "all_week": tsAllWeek,
    },
    heatmaps: {
      hourOfWeek: heatmapHour,
      mode: heatmapMode,
    },
    activityFeed: cleanFeed,
    analytics,
  };
}

async function main() {
  const dataAsOf = new Date().toISOString();
  const [tempo, base] = await Promise.all(CHAINS.map(fetchChain));

  const snapshot = {
    schemaVersion: "1.0.0",
    dataAsOf,
    sourceBaseUrl: BASE_URL,
    refreshCadence: "Every 30 minutes via GitHub Actions (cached statically >= 60s)",
    endpointsUsed: [
      "/api/market/stats?chainId={4217|8453}",
      "/api/stats/breakdowns?chainId={4217|8453}",
      "/api/stats/platform-time-series?chainId={4217|8453}&range={7d|30d|90d|all}&bucket={day|week}",
      "/api/stats/activity-heatmap?chainId={4217|8453}&range=30d&dimension={hourOfWeek|mode}",
      "/api/stats/activity-feed?chainId={4217|8453}&limit=40",
      "/api/tasks?chainId={4217|8453}&sort=newest&limit=100&cursor=...",
    ],
    chains: { tempo, base },
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`[done] Wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB) as of ${dataAsOf}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
