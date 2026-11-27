#!/usr/bin/env node
/**
 * Fetches live read-only market data from https://api.taskmarket.dev for Tempo (4217)
 * and Base (8453), computes verifiable derived analytics (distinct weekly posters,
 * poster concentration, task mortality, swarm convergence), and writes data/snapshot.json.
 *
 * MIT License — built for Taskmarket bounty TSK-BRK611AN.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_BASE = 'https://api.taskmarket.dev';
const CHAINS = [
  { id: 4217, key: 'tempo', name: 'Tempo', token: 'OUSD', decimals: 6 },
  { id: 8453, key: 'base', name: 'Base', token: 'USDC', decimals: 6 },
];

async function fetchJson(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'taskmarket-pulse/1.0 (+https://github.com/AndreyJackKali/taskmarket-pulse)' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${endpoint}`);
  }
  return res.json();
}

function isoWeekKey(isoDateStr) {
  const d = new Date(isoDateStr);
  if (Number.isNaN(d.getTime())) return null;
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  // Also compute Monday start date of this ISO week for clear axis labels
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = mon.getUTCDay() || 7;
  mon.setUTCDate(mon.getUTCDate() - (dow - 1));
  return {
    week: `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
    weekStart: mon.toISOString().slice(0, 10),
  };
}

async function fetchAllTasksForChain(chainId, maxPages = 35) {
  const tasks = [];
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const q = `/api/tasks?chainId=${chainId}&sort=newest&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const data = await fetchJson(q);
    const batch = data.tasks || (data.data && data.data.tasks) || [];
    for (const t of batch) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        tasks.push(t);
      }
    }
    if (!data.hasMore || !data.nextCursor || batch.length === 0) break;
    cursor = data.nextCursor;
  }
  return tasks;
}

function computeTaskAnalytics(tasks, decimals = 6) {
  const scale = 10 ** decimals;
  const weekMap = new Map();
  const posterMap = new Map();
  const statusCounts = {};
  const modeStats = {};
  const modeToStatus = {};
  const openSwarm = [];
  let totalRewardUsd = 0;
  let completedCount = 0;
  let deadCount = 0;
  let totalSubs = 0;
  const decisionHours = [];

  for (const t of tasks) {
    const reqAddr = (t.requester || '').toLowerCase();
    const rewardUsd = Number(t.reward || 0) / scale;
    const status = t.status || 'unknown';
    const mode = t.mode || 'unknown';
    const subs = Number(t.submissionCount || 0);

    totalRewardUsd += rewardUsd;
    totalSubs += subs;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'completed') completedCount++;
    if (status === 'expired' || status === 'cancelled') deadCount++;

    if (!modeStats[mode]) {
      modeStats[mode] = { count: 0, rewardUsd: 0, completed: 0, dead: 0, open: 0, subs: 0 };
    }
    modeStats[mode].count++;
    modeStats[mode].rewardUsd += rewardUsd;
    modeStats[mode].subs += subs;
    if (status === 'completed') modeStats[mode].completed++;
    else if (status === 'expired' || status === 'cancelled') modeStats[mode].dead++;
    else modeStats[mode].open++;

    const flowKey = `${mode}__${status === 'completed' ? 'completed' : (status === 'expired' || status === 'cancelled') ? 'dead' : 'active'}`;
    if (!modeToStatus[flowKey]) modeToStatus[flowKey] = { count: 0, rewardUsd: 0 };
    modeToStatus[flowKey].count++;
    modeToStatus[flowKey].rewardUsd += rewardUsd;

    if (reqAddr) {
      const p = posterMap.get(reqAddr) || { address: reqAddr, tasks: 0, rewardUsd: 0, completed: 0, dead: 0 };
      p.tasks++;
      p.rewardUsd += rewardUsd;
      if (status === 'completed') p.completed++;
      if (status === 'expired' || status === 'cancelled') p.dead++;
      posterMap.set(reqAddr, p);
    }

    if (t.createdAt) {
      const wk = isoWeekKey(t.createdAt);
      if (wk) {
        let row = weekMap.get(wk.week);
        if (!row) {
          row = { week: wk.week, weekStart: wk.weekStart, posters: new Set(), tasks: 0, rewardUsd: 0 };
          weekMap.set(wk.week, row);
        }
        if (reqAddr) row.posters.add(reqAddr);
        row.tasks++;
        row.rewardUsd += rewardUsd;
      }
    }

    if (t.createdAt && t.completedAt) {
      const hrs = (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000;
      if (hrs >= 0 && hrs < 24 * 120) decisionHours.push(hrs);
    }

    if (status === 'open') {
      const firstLine = String(t.title || t.description || '').split('\n')[0].trim().slice(0, 72);
      openSwarm.push({
        code: t.referenceCode || t.id.slice(0, 10),
        mode,
        rewardUsd: Number(rewardUsd.toFixed(4)),
        subs,
        tapOnly: Array.isArray(t.verifiedBy) && t.verifiedBy.length > 0,
        expiryTime: t.expiryTime || null,
        title: firstLine,
      });
    }
  }

  const weeklyPosters = Array.from(weekMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((r) => ({
      week: r.week,
      weekStart: r.weekStart,
      distinctPosters: r.posters.size,
      tasks: r.tasks,
      rewardUsd: Number(r.rewardUsd.toFixed(2)),
    }));

  const postersSortedByTasks = Array.from(posterMap.values()).sort((a, b) => b.tasks - a.tasks);
  const postersSortedByVol = Array.from(posterMap.values()).sort((a, b) => b.rewardUsd - a.rewardUsd);
  const totalTasks = tasks.length || 1;
  const top1TaskShare = postersSortedByTasks[0] ? (postersSortedByTasks[0].tasks / totalTasks) : 0;
  const top5TaskShare = postersSortedByTasks.slice(0, 5).reduce((s, p) => s + p.tasks, 0) / totalTasks;
  const top5VolShare = totalRewardUsd > 0
    ? postersSortedByVol.slice(0, 5).reduce((s, p) => s + p.rewardUsd, 0) / totalRewardUsd
    : 0;

  // HHI concentration index (0..10000)
  const hhiTasks = Math.round(
    postersSortedByTasks.reduce((s, p) => s + ((p.tasks / totalTasks) * 100) ** 2, 0)
  );

  decisionHours.sort((a, b) => a - b);
  const medianDecisionHours = decisionHours.length
    ? Number(decisionHours[Math.floor(decisionHours.length / 2)].toFixed(2))
    : null;

  openSwarm.sort((a, b) => b.rewardUsd - a.rewardUsd || b.subs - a.subs);

  return {
    fetchedTaskCount: tasks.length,
    distinctPostersAllTime: posterMap.size,
    totalRewardUsd: Number(totalRewardUsd.toFixed(2)),
    avgSubsPerTask: Number((totalSubs / totalTasks).toFixed(2)),
    completionRatePct: Number(((completedCount / totalTasks) * 100).toFixed(1)),
    mortalityRatePct: Number(((deadCount / totalTasks) * 100).toFixed(1)),
    medianDecisionHours,
    concentration: {
      top1TaskSharePct: Number((top1TaskShare * 100).toFixed(1)),
      top5TaskSharePct: Number((top5TaskShare * 100).toFixed(1)),
      top5VolSharePct: Number((top5VolShare * 100).toFixed(1)),
      hhiTasks,
      topPosters: postersSortedByVol.slice(0, 8).map((p) => ({
        addressShort: `${p.address.slice(0, 6)}...${p.address.slice(-4)}`,
        tasks: p.tasks,
        rewardUsd: Number(p.rewardUsd.toFixed(2)),
        completed: p.completed,
        dead: p.dead,
      })),
    },
    statusFromTasks: statusCounts,
    modeStats: Object.fromEntries(
      Object.entries(modeStats).map(([k, v]) => [k, { ...v, rewardUsd: Number(v.rewardUsd.toFixed(2)) }])
    ),
    flowLinks: modeToStatus,
    weeklyPosters,
    openSwarm: openSwarm.slice(0, 48),
  };
}

async function fetchChainBundle(chain) {
  const cid = chain.id;
  const [
    stats,
    breakdowns,
    ts7d,
    ts30d,
    ts90d,
    tsAllDay,
    tsAllWeek,
    heatmapHour,
    heatmapMode,
    activityFeed,
    allTasks,
  ] = await Promise.all([
    fetchJson(`/api/market/stats?chainId=${cid}`),
    fetchJson(`/api/stats/breakdowns?chainId=${cid}`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=7d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=30d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=90d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=all&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=all&bucket=week`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=hourOfWeek`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=mode`),
    fetchJson(`/api/stats/activity-feed?chainId=${cid}&limit=30`),
    fetchAllTasksForChain(cid, 35),
  ]);

  const analytics = computeTaskAnalytics(allTasks, chain.decimals);

  return {
    chainId: cid,
    key: chain.key,
    name: chain.name,
    token: chain.token,
    stats,
    breakdowns,
    timeSeries: {
      '7d': ts7d,
      '30d': ts30d,
      '90d': ts90d,
      'all_day': tsAllDay,
      'all_week': tsAllWeek,
    },
    heatmap: {
      hourOfWeek: heatmapHour,
      mode: heatmapMode,
    },
    activityFeed: (activityFeed.items || []).slice(0, 30),
    analytics,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const bundles = {};
  for (const chain of CHAINS) {
    console.log(`Fetching chain ${chain.name} (${chain.id})...`);
    bundles[chain.key] = await fetchChainBundle(chain);
    const a = bundles[chain.key].analytics;
    console.log(
      `  ${chain.name}: ${a.fetchedTaskCount} tasks, ${a.distinctPostersAllTime} distinct posters, ` +
      `$${a.totalRewardUsd} total reward, ${a.weeklyPosters.length} weeks`
    );
  }

  const snapshot = {
    schemaVersion: '1.0',
    fetchedAtUtc: new Date().toISOString(),
    startedAtUtc: startedAt,
    apiBase: API_BASE,
    endpoints: [
      '/api/market/stats?chainId={4217|8453}',
      '/api/stats/breakdowns?chainId={4217|8453}',
      '/api/stats/platform-time-series?chainId={4217|8453}&range={7d|30d|90d|all}&bucket={day|week}',
      '/api/stats/activity-heatmap?chainId={4217|8453}&range=30d&dimension={hourOfWeek|mode}',
      '/api/stats/activity-feed?chainId={4217|8453}&limit=30',
      '/api/tasks?chainId={4217|8453}&sort=newest&limit=100&cursor=...',
    ],
    chains: bundles,
  };

  const outDir = path.join(ROOT, 'data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'snapshot.json');
  await fs.writeFile(outPath, JSON.stringify(snapshot), 'utf8');
  const st = await fs.stat(outPath);
  console.log(`Wrote ${outPath} (${(st.size / 1024).toFixed(1)} KB) at ${snapshot.fetchedAtUtc}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
