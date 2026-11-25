#!/usr/bin/env node
/**
 * Taskmarket Pulse — Server-Side Snapshot Fetcher (v1.2.0)
 * Fetches live market data from https://api.taskmarket.dev for Tempo (4217) and Base (8453),
 * computes reproducible analytics (distinct posters/week, requester & winner concentration,
 * poster->mode->winner capital flow, reward-tier mortality, decision timing, 7d WoW growth,
 * and live swarm convergence), and writes docs/data/snapshot.json. Zero external dependencies.
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
        headers: { "User-Agent": "taskmarket-pulse/1.2 (+https://github.com/AndreyJackKali/taskmarket-pulse)" },
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

export function isoWeekKey(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7; // Mon=1..Sun=7
  utc.setUTCDate(utc.getUTCDate() - day + 1); // Monday of ISO week
  const weekStart = utc.toISOString().slice(0, 10);
  const thurs = new Date(utc);
  thurs.setUTCDate(thurs.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thurs.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((thurs - yearStart) / 86400000 + 1) / 7);
  return { weekStart, isoWeek: `${thurs.getUTCFullYear()}-W${String(wk).padStart(2, "0")}` };
}

export function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || "unknown";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function toUsd(baseUnits) {
  const n = Number(baseUnits || 0);
  return Number.isFinite(n) ? n / 1e6 : 0;
}

export function percentile(arr, p = 0.5) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export function rewardTierLabel(usd) {
  if (usd < 0.5) return "<$0.50";
  if (usd < 2) return "$0.50–$2";
  if (usd < 10) return "$2–$10";
  return "$10+";
}

export function computeGrowthMetrics(ts30dDay = []) {
  // Exclude today's partial UTC bucket when >= 15 rows exist so WoW compares 7 complete days vs prior 7 complete days
  const rows = Array.isArray(ts30dDay) ? [...ts30dDay].sort((a, b) => a.bucket.localeCompare(b.bucket)) : [];
  if (rows.length < 14) {
    return {
      windowLabel: "Insufficient daily history",
      tasksCur: 0,
      tasksPrev: 0,
      tasksDeltaPct: null,
      paidCurUsd: 0,
      paidPrevUsd: 0,
      paidDeltaPct: null,
      escrowedCurUsd: 0,
      escrowedPrevUsd: 0,
      escrowedDeltaPct: null,
      avgAgentsCur: 0,
      avgAgentsPrev: 0,
      agentsDeltaPct: null,
    };
  }
  const endIdx = rows.length >= 15 ? rows.length - 1 : rows.length;
  const cur = rows.slice(endIdx - 7, endIdx);
  const prev = rows.slice(endIdx - 14, endIdx - 7);

  const sum = (list, fn) => list.reduce((acc, r) => acc + fn(r), 0);
  const pct = (c, p) => (p > 0 ? Number((((c - p) / p) * 100).toFixed(1)) : null);

  const tasksCur = sum(cur, (r) => Number(r.tasksCreated || 0));
  const tasksPrev = sum(prev, (r) => Number(r.tasksCreated || 0));
  const paidCurUsd = Number(sum(cur, (r) => toUsd(r.paidVolume)).toFixed(2));
  const paidPrevUsd = Number(sum(prev, (r) => toUsd(r.paidVolume)).toFixed(2));
  const escrowedCurUsd = Number(sum(cur, (r) => toUsd(r.rewardVolume)).toFixed(2));
  const escrowedPrevUsd = Number(sum(prev, (r) => toUsd(r.rewardVolume)).toFixed(2));
  const avgAgentsCur = Number((sum(cur, (r) => Number(r.activeAgents || 0)) / cur.length).toFixed(1));
  const avgAgentsPrev = Number((sum(prev, (r) => Number(r.activeAgents || 0)) / prev.length).toFixed(1));

  return {
    windowLabel: `${cur[0].bucket}..${cur[cur.length - 1].bucket} vs ${prev[0].bucket}..${prev[prev.length - 1].bucket}`,
    tasksCur,
    tasksPrev,
    tasksDeltaPct: pct(tasksCur, tasksPrev),
    paidCurUsd,
    paidPrevUsd,
    paidDeltaPct: pct(paidCurUsd, paidPrevUsd),
    escrowedCurUsd,
    escrowedPrevUsd,
    escrowedDeltaPct: pct(escrowedCurUsd, escrowedPrevUsd),
    avgAgentsCur,
    avgAgentsPrev,
    agentsDeltaPct: pct(avgAgentsCur, avgAgentsPrev),
  };
}

export function computeTaskAnalytics(tasks, cleanFeed = [], nowIso = new Date().toISOString()) {
  const nowMs = new Date(nowIso).getTime();
  const weeklyMap = new Map();
  const posterCounts = new Map();
  const posterVol = new Map();
  const winnerCounts = new Map();
  const winnerVol = new Map();
  const winnerRequesters = new Map();
  const modeStatusCount = new Map();
  const modeStatusVol = new Map();
  const lifespanHours = [];
  const completedWindowHours = [];
  const deadWindowHours = [];
  const completedSubs = [];
  const deadSubs = [];
  const claimMinutes = [];
  const rewards = [];
  const openSwarm = [];
  const taskById = new Map();

  const TIER_ORDER = ["<$0.50", "$0.50–$2", "$2–$10", "$10+"];
  const tierStats = new Map(
    TIER_ORDER.map((tier) => [tier, { tier, total: 0, completed: 0, dead: 0, open: 0, rewardUsd: 0 }])
  );

  let completedCount = 0;
  let deadCount = 0; // expired + cancelled
  let totalRewardUsd = 0;

  for (const t of tasks) {
    if (t.id) taskById.set(t.id, t);
    const req = (t.requester || "").toLowerCase();
    const reward = toUsd(t.reward);
    totalRewardUsd += reward;
    if (reward > 0) rewards.push(reward);

    if (req) {
      posterCounts.set(req, (posterCounts.get(req) || 0) + 1);
      posterVol.set(req, (posterVol.get(req) || 0) + reward);
    }

    const winner = (t.primaryAward?.workerAddress || "").toLowerCase();
    if (t.status === "completed" && winner) {
      winnerCounts.set(winner, (winnerCounts.get(winner) || 0) + 1);
      winnerVol.set(winner, (winnerVol.get(winner) || 0) + reward);
      if (!winnerRequesters.has(winner)) winnerRequesters.set(winner, new Set());
      if (req) winnerRequesters.get(winner).add(req);
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

    const tierRow = tierStats.get(rewardTierLabel(reward));
    tierRow.total += 1;
    tierRow.rewardUsd += reward;
    if (status === "completed") tierRow.completed += 1;
    else if (status === "expired" || status === "cancelled") tierRow.dead += 1;
    else tierRow.open += 1;

    const msKey = `${mode}::${bucketStatus}`;
    modeStatusCount.set(msKey, (modeStatusCount.get(msKey) || 0) + 1);
    modeStatusVol.set(msKey, (modeStatusVol.get(msKey) || 0) + reward);

    if (t.createdAt && t.expiryTime) {
      const hrs = (new Date(t.expiryTime) - new Date(t.createdAt)) / 3600000;
      if (hrs > 0 && hrs < 24 * 120) {
        lifespanHours.push(hrs);
        if (status === "completed") completedWindowHours.push(hrs);
        else if (status === "expired" || status === "cancelled") deadWindowHours.push(hrs);
      }
    }

    if (typeof t.submissionCount === "number") {
      if (status === "completed") completedSubs.push(t.submissionCount);
      else if (status === "expired" || status === "cancelled") deadSubs.push(t.submissionCount);
    }

    if (t.createdAt && t.claimedAt) {
      const cm = (new Date(t.claimedAt) - new Date(t.createdAt)) / 60000;
      if (cm >= 0 && cm < 60 * 24 * 60) claimMinutes.push(cm);
    }

    if (status === "open") {
      const titleLine = String(t.description || "").split("\n")[0].trim().slice(0, 96);
      const subs = Number(t.submissionCount || 0);
      const hrsLeft = t.expiryTime ? Math.max(0, (new Date(t.expiryTime).getTime() - nowMs) / 3600000) : null;
      openSwarm.push({
        ref: t.referenceCode || t.id.slice(0, 10),
        id: t.id,
        title: titleLine || t.referenceCode || "Untitled task",
        mode,
        rewardUsd: Number(reward.toFixed(2)),
        submissions: subs,
        rewardPerSubUsd: Number((reward / Math.max(1, subs)).toFixed(3)),
        hoursLeft: hrsLeft !== null ? Number(hrsLeft.toFixed(1)) : null,
        requesterShort: shortAddr(t.requester),
        createdAt: t.createdAt,
        expiryTime: t.expiryTime,
        verifiedRequired: Array.isArray(t.verifiedBy) && t.verifiedBy.length > 0,
      });
    }
  }

  // Exact observed time-to-decision from matched task_completed feed events
  const observedDecisionHours = [];
  for (const ev of cleanFeed || []) {
    if (ev.type !== "task_completed" || !ev.taskId || !ev.timestamp) continue;
    const t = taskById.get(ev.taskId);
    if (!t || !t.createdAt) continue;
    const dh = (new Date(ev.timestamp) - new Date(t.createdAt)) / 3600000;
    if (dh >= 0 && dh < 24 * 90) observedDecisionHours.push(dh);
  }

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

  const postersSorted = [...posterCounts.entries()]
    .map(([addr, count]) => ({
      walletShort: shortAddr(addr),
      tasks: count,
      rewardUsd: Number((posterVol.get(addr) || 0).toFixed(2)),
    }))
    .sort((a, b) => b.tasks - a.tasks || b.rewardUsd - a.rewardUsd);

  const winnersSorted = [...winnerCounts.entries()]
    .map(([addr, count]) => ({
      walletShort: shortAddr(addr),
      awards: count,
      rewardUsd: Number((winnerVol.get(addr) || 0).toFixed(2)),
      distinctRequesters: winnerRequesters.get(addr)?.size || 0,
    }))
    .sort((a, b) => b.awards - a.awards || b.rewardUsd - a.rewardUsd);

  const totalTasks = tasks.length || 1;
  const totalAwarded = [...winnerCounts.values()].reduce((s, n) => s + n, 0) || 1;
  const top3Tasks = postersSorted.slice(0, 3).reduce((s, x) => s + x.tasks, 0);
  const top5Tasks = postersSorted.slice(0, 5).reduce((s, x) => s + x.tasks, 0);
  const top10Tasks = postersSorted.slice(0, 10).reduce((s, x) => s + x.tasks, 0);
  const top5WinnerAwards = winnersSorted.slice(0, 5).reduce((s, x) => s + x.awards, 0);
  const repeatPosters = postersSorted.filter((x) => x.tasks >= 2).length;
  const oneOffPosters = postersSorted.filter((x) => x.tasks === 1).length;
  const repeatWinners = winnersSorted.filter((x) => x.awards >= 2).length;
  const oneOffWinners = winnersSorted.filter((x) => x.awards === 1).length;

  // Cohort -> Mode -> Outcome AND Cohort -> Mode -> Winner Cohort flows
  const top3Set = new Set([...posterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]));
  const top10Set = new Set([...posterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]));
  const top5WinnerSet = new Set([...winnerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]));

  const cohortToMode = new Map();
  const modeToWinner = new Map();
  for (const t of tasks) {
    const req = (t.requester || "").toLowerCase();
    const cohort = top3Set.has(req) ? "Top 3 Posters" : top10Set.has(req) ? "Rank 4–10 Posters" : "Long-Tail Posters";
    const mode = t.mode || "bounty";
    const reward = toUsd(t.reward);
    const k = `${cohort}::${mode}`;
    const prev = cohortToMode.get(k) || { tasks: 0, rewardUsd: 0 };
    prev.tasks += 1;
    prev.rewardUsd += reward;
    cohortToMode.set(k, prev);

    let winnerCohort = "Open / Active";
    if (t.status === "completed") {
      const w = (t.primaryAward?.workerAddress || "").toLowerCase();
      if (w && top5WinnerSet.has(w)) winnerCohort = "Top 5 Winners";
      else if (w && (winnerCounts.get(w) || 0) >= 2) winnerCohort = "Repeat Winners";
      else winnerCohort = "First-Time Winners";
    } else if (t.status === "expired" || t.status === "cancelled") {
      winnerCohort = "Expired / Cancelled";
    }
    const wkKey = `${mode}::${winnerCohort}`;
    const wPrev = modeToWinner.get(wkKey) || { tasks: 0, rewardUsd: 0 };
    wPrev.tasks += 1;
    wPrev.rewardUsd += reward;
    modeToWinner.set(wkKey, wPrev);
  }

  const flowLinksCohortMode = [...cohortToMode.entries()].map(([k, v]) => {
    const [source, target] = k.split("::");
    return { source, target, tasks: v.tasks, rewardUsd: Number(v.rewardUsd.toFixed(2)) };
  });
  const flowLinksModeStatus = [...modeStatusCount.entries()].map(([k, cnt]) => {
    const [source, target] = k.split("::");
    return { source, target, tasks: cnt, rewardUsd: Number((modeStatusVol.get(k) || 0).toFixed(2)) };
  });
  const flowLinksModeWinner = [...modeToWinner.entries()].map(([k, v]) => {
    const [source, target] = k.split("::");
    return { source, target, tasks: v.tasks, rewardUsd: Number(v.rewardUsd.toFixed(2)) };
  });

  const mortalityByTier = TIER_ORDER.map((tier) => {
    const r = tierStats.get(tier);
    const resolved = r.completed + r.dead;
    return {
      tier: r.tier,
      total: r.total,
      completed: r.completed,
      dead: r.dead,
      open: r.open,
      rewardUsd: Number(r.rewardUsd.toFixed(2)),
      completionRatePct: r.total > 0 ? Number(((r.completed / r.total) * 100).toFixed(1)) : 0,
      mortalityRatePct: r.total > 0 ? Number(((r.dead / r.total) * 100).toFixed(1)) : 0,
      resolvedMortalityPct: resolved > 0 ? Number(((r.dead / resolved) * 100).toFixed(1)) : 0,
    };
  });

  openSwarm.sort((a, b) => b.submissions - a.submissions || b.rewardUsd - a.rewardUsd);

  return {
    indexedTasksCount: tasks.length,
    distinctPostersTotal: postersSorted.length,
    repeatPosters,
    oneOffPosters,
    distinctWinnersTotal: winnersSorted.length,
    repeatWinners,
    oneOffWinners,
    top3SharePct: Number(((top3Tasks / totalTasks) * 100).toFixed(1)),
    top5SharePct: Number(((top5Tasks / totalTasks) * 100).toFixed(1)),
    top10SharePct: Number(((top10Tasks / totalTasks) * 100).toFixed(1)),
    top5WinnerSharePct: Number(((top5WinnerAwards / totalAwarded) * 100).toFixed(1)),
    completionRatePct: Number(((completedCount / totalTasks) * 100).toFixed(1)),
    mortalityRatePct: Number(((deadCount / totalTasks) * 100).toFixed(1)),
    medianRewardUsd: Number(percentile(rewards, 0.5).toFixed(2)),
    medianWindowHours: Number(percentile(lifespanHours, 0.5).toFixed(1)),
    indexedRewardVolumeUsd: Number(totalRewardUsd.toFixed(2)),
    decisionTiming: {
      completedWindowP25H: Number(percentile(completedWindowHours, 0.25).toFixed(1)),
      completedWindowMedianH: Number(percentile(completedWindowHours, 0.5).toFixed(1)),
      completedWindowP75H: Number(percentile(completedWindowHours, 0.75).toFixed(1)),
      deadWindowMedianH: Number(percentile(deadWindowHours, 0.5).toFixed(1)),
      observedDecisionMedianH: observedDecisionHours.length
        ? Number(percentile(observedDecisionHours, 0.5).toFixed(1))
        : null,
      observedDecisionSamples: observedDecisionHours.length,
      medianClaimMinutes: claimMinutes.length ? Number(percentile(claimMinutes, 0.5).toFixed(1)) : null,
      claimSamples: claimMinutes.length,
      completedSubsMedian: completedSubs.length ? Number(percentile(completedSubs, 0.5).toFixed(1)) : 0,
      deadSubsMedian: deadSubs.length ? Number(percentile(deadSubs, 0.5).toFixed(1)) : 0,
    },
    mortalityByTier,
    distinctPostersByWeek,
    topPosters: postersSorted.slice(0, 12),
    topWinners: winnersSorted.slice(0, 12),
    flow: {
      cohortToMode: flowLinksCohortMode,
      modeToStatus: flowLinksModeStatus,
      modeToWinner: flowLinksModeWinner,
    },
    swarmConvergence: openSwarm.slice(0, 24),
  };
}

async function fetchChain(chain, dataAsOf) {
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

  const analytics = computeTaskAnalytics(allTasks, cleanFeed, dataAsOf);
  const growth7d = computeGrowthMetrics(ts30dDay);

  console.log(
    `[ok] ${chain.name}: open=${headline.openTasks}, paidWorkers=${headline.paidWorkers}, indexedTasks=${allTasks.length}, posters=${analytics.distinctPostersTotal}, winners=${analytics.distinctWinnersTotal}`
  );

  return {
    meta: chain,
    headline,
    breakdowns,
    growth7d,
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
  const [tempo, base] = await Promise.all(CHAINS.map((c) => fetchChain(c, dataAsOf)));

  const snapshot = {
    schemaVersion: "1.2.0",
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
  console.log(`[done] Wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB) at ${dataAsOf}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
  });
}
