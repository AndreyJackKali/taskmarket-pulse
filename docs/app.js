/**
 * Taskmarket Pulse (v1.2.0) — Client Renderer (Zero External Dependencies, Read-Only, No Tracking)
 * Reads strictly from server-cached ./data/snapshot.json (zero browser calls to api.taskmarket.dev).
 */

const state = {
  snap: null,
  chain: "tempo", // tempo | base | both
  view: "overview", // overview | timeseries | posters | heatmap | feed | methods
  range: "30d", // 7d | 30d | 90d | all
  bucket: "day", // day | week
  flowMetric: "tasks", // tasks | rewardUsd | winnersUsd
  heatmapDim: "hourOfWeek", // hourOfWeek | mode
  feedType: "all",
};

const PALETTE = {
  ground: "#12100E",
  panel: "#221E1A",
  line: "#453E37",
  cream: "#EFE9E2",
  paper: "#FFF6E8",
  muted: "#B0A79D",
  magenta: "#E74079",
  salmon: "#D9A097",
  maroon: "#3A1420",
};

const VIEW_CARDS = {
  overview: "og-overview.png",
  timeseries: "og-timeseries.png",
  posters: "og-posters.png",
  heatmap: "og-heatmap.png",
  feed: "og-flow.png",
  methods: "og-overview.png",
};

const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
const fmtUsd = (n) => {
  const v = Number(n || 0);
  if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDelta = (v) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "n/a WoW";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}% WoW`;
};
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function parseHash() {
  const h = location.hash.replace(/^#/, "");
  if (!h) return;
  const params = new URLSearchParams(h);
  const v = params.get("view");
  const c = params.get("chain");
  const r = params.get("range");
  const f = params.get("flow");
  if (v && ["overview", "timeseries", "posters", "heatmap", "feed", "methods"].includes(v)) state.view = v;
  if (c && ["tempo", "base", "both"].includes(c)) state.chain = c;
  if (r && ["7d", "30d", "90d", "all"].includes(r)) state.range = r;
  if (f && ["tasks", "rewardUsd", "winnersUsd"].includes(f)) state.flowMetric = f;
}

function syncHash() {
  const params = new URLSearchParams({ view: state.view, chain: state.chain });
  if (state.view === "timeseries") params.set("range", state.range);
  if (state.view === "overview" && state.flowMetric !== "tasks") params.set("flow", state.flowMetric);
  history.replaceState(null, "", `#${params.toString()}`);
}

const tipEl = document.getElementById("tooltip");
function showTip(ev, html) {
  tipEl.innerHTML = html;
  tipEl.style.display = "block";
  const x = Math.min(window.innerWidth - 295, ev.clientX + 14);
  const y = Math.min(window.innerHeight - 135, ev.clientY + 14);
  tipEl.style.left = `${Math.max(8, x)}px`;
  tipEl.style.top = `${Math.max(8, y)}px`;
}
function hideTip() {
  tipEl.style.display = "none";
}

function getActiveChainData() {
  const { tempo, base } = state.snap.chains;
  if (state.chain === "tempo") return tempo;
  if (state.chain === "base") return base;

  const mergeCountArrays = (a = [], b = [], key) => {
    const map = new Map();
    for (const row of [...a, ...b]) {
      map.set(row[key], (map.get(row[key]) || 0) + Number(row.count || 0));
    }
    return [...map.entries()].map(([k, count]) => ({ [key]: k, count }));
  };

  const sameTs = JSON.stringify(tempo.timeSeries["30d_day"] || []) === JSON.stringify(base.timeSeries["30d_day"] || []);
  const mergeTimeSeries = (k) => {
    if (sameTs) return tempo.timeSeries[k] || [];
    const map = new Map();
    for (const row of [...(tempo.timeSeries[k] || []), ...(base.timeSeries[k] || [])]) {
      const prev = map.get(row.bucket) || {
        bucket: row.bucket,
        tasksCreated: 0,
        rewardVolume: 0,
        completedTasks: 0,
        newAgents: 0,
        activeAgents: 0,
        paidVolume: 0,
        settlements: 0,
      };
      prev.tasksCreated += Number(row.tasksCreated || 0);
      prev.rewardVolume += Number(row.rewardVolume || 0);
      prev.completedTasks += Number(row.completedTasks || 0);
      prev.newAgents += Number(row.newAgents || 0);
      prev.activeAgents += Number(row.activeAgents || 0);
      prev.paidVolume += Number(row.paidVolume || 0);
      prev.settlements += Number(row.settlements || 0);
      map.set(row.bucket, prev);
    }
    return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  };

  const weekMap = new Map();
  for (const w of [...tempo.analytics.distinctPostersByWeek, ...base.analytics.distinctPostersByWeek]) {
    const prev = weekMap.get(w.weekStart) || { weekStart: w.weekStart, isoWeek: w.isoWeek, distinctPosters: 0, tasks: 0, rewardUsd: 0, completed: 0 };
    prev.distinctPosters += w.distinctPosters;
    prev.tasks += w.tasks;
    prev.rewardUsd += w.rewardUsd;
    prev.completed += w.completed;
    weekMap.set(w.weekStart, prev);
  }

  const mergeFlow = (listA = [], listB = []) => {
    const m = new Map();
    for (const e of [...listA, ...listB]) {
      const k = `${e.source}::${e.target}`;
      const p = m.get(k) || { source: e.source, target: e.target, tasks: 0, rewardUsd: 0 };
      p.tasks += e.tasks;
      p.rewardUsd = Number((p.rewardUsd + e.rewardUsd).toFixed(2));
      m.set(k, p);
    }
    return [...m.values()];
  };

  const tierMap = new Map();
  for (const row of [...(tempo.analytics.mortalityByTier || []), ...(base.analytics.mortalityByTier || [])]) {
    const p = tierMap.get(row.tier) || { tier: row.tier, total: 0, completed: 0, dead: 0, open: 0, rewardUsd: 0 };
    p.total += row.total;
    p.completed += row.completed;
    p.dead += row.dead;
    p.open += row.open;
    p.rewardUsd = Number((p.rewardUsd + row.rewardUsd).toFixed(2));
    tierMap.set(row.tier, p);
  }
  const mergedTiers = [...tierMap.values()].map((r) => {
    const resolved = r.completed + r.dead;
    return {
      ...r,
      completionRatePct: r.total > 0 ? Number(((r.completed / r.total) * 100).toFixed(1)) : 0,
      mortalityRatePct: r.total > 0 ? Number(((r.dead / r.total) * 100).toFixed(1)) : 0,
      resolvedMortalityPct: resolved > 0 ? Number(((r.dead / resolved) * 100).toFixed(1)) : 0,
    };
  });

  const totalIdx = tempo.analytics.indexedTasksCount + base.analytics.indexedTasksCount;
  const weightedComp =
    (tempo.analytics.completionRatePct * tempo.analytics.indexedTasksCount +
      base.analytics.completionRatePct * base.analytics.indexedTasksCount) /
    (totalIdx || 1);
  const weightedMort =
    (tempo.analytics.mortalityRatePct * tempo.analytics.indexedTasksCount +
      base.analytics.mortalityRatePct * base.analytics.indexedTasksCount) /
    (totalIdx || 1);

  return {
    meta: { id: "4217+8453", key: "both", name: "Tempo + Base", token: "OUSD/USDC" },
    headline: {
      registeredWorkers: Math.max(tempo.headline.registeredWorkers || 0, base.headline.registeredWorkers || 0),
      activeWorkers7d: Math.max(tempo.headline.activeWorkers7d || 0, base.headline.activeWorkers7d || 0),
      activeAgents7d: Math.max(tempo.headline.activeAgents7d || 0, base.headline.activeAgents7d || 0),
      openTasks: Math.max(tempo.headline.openTasks || 0, base.headline.openTasks || 0),
      paidWorkers: (tempo.headline.paidWorkers || 0) + (base.headline.paidWorkers || 0),
      activeWallets: (tempo.headline.activeWallets || 0) + (base.headline.activeWallets || 0),
    },
    growth7d: tempo.growth7d,
    breakdowns: {
      status: JSON.stringify(tempo.breakdowns.status) === JSON.stringify(base.breakdowns.status)
        ? tempo.breakdowns.status
        : mergeCountArrays(tempo.breakdowns.status, base.breakdowns.status, "status"),
      mode: JSON.stringify(tempo.breakdowns.mode) === JSON.stringify(base.breakdowns.mode)
        ? tempo.breakdowns.mode
        : mergeCountArrays(tempo.breakdowns.mode, base.breakdowns.mode, "mode"),
      actorType: JSON.stringify(tempo.breakdowns.actorType) === JSON.stringify(base.breakdowns.actorType)
        ? tempo.breakdowns.actorType
        : mergeCountArrays(tempo.breakdowns.actorType, base.breakdowns.actorType, "actorType"),
    },
    timeSeries: {
      "7d_day": mergeTimeSeries("7d_day"),
      "30d_day": mergeTimeSeries("30d_day"),
      "90d_day": mergeTimeSeries("90d_day"),
      "90d_week": mergeTimeSeries("90d_week"),
      "all_day": mergeTimeSeries("all_day"),
      "all_week": mergeTimeSeries("all_week"),
    },
    heatmaps: tempo.heatmaps,
    activityFeed: [...tempo.activityFeed, ...base.activityFeed]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 50),
    analytics: {
      indexedTasksCount: totalIdx,
      distinctPostersTotal: tempo.analytics.distinctPostersTotal + base.analytics.distinctPostersTotal,
      repeatPosters: tempo.analytics.repeatPosters + base.analytics.repeatPosters,
      oneOffPosters: tempo.analytics.oneOffPosters + base.analytics.oneOffPosters,
      distinctWinnersTotal: (tempo.analytics.distinctWinnersTotal || 0) + (base.analytics.distinctWinnersTotal || 0),
      repeatWinners: (tempo.analytics.repeatWinners || 0) + (base.analytics.repeatWinners || 0),
      oneOffWinners: (tempo.analytics.oneOffWinners || 0) + (base.analytics.oneOffWinners || 0),
      top3SharePct: tempo.analytics.top3SharePct,
      top5SharePct: tempo.analytics.top5SharePct,
      top10SharePct: tempo.analytics.top10SharePct,
      top5WinnerSharePct: tempo.analytics.top5WinnerSharePct || 0,
      completionRatePct: Number(weightedComp.toFixed(1)),
      mortalityRatePct: Number(weightedMort.toFixed(1)),
      medianRewardUsd: tempo.analytics.medianRewardUsd,
      medianWindowHours: tempo.analytics.medianWindowHours,
      decisionTiming: tempo.analytics.decisionTiming,
      mortalityByTier: mergedTiers,
      indexedRewardVolumeUsd: Number((tempo.analytics.indexedRewardVolumeUsd + base.analytics.indexedRewardVolumeUsd).toFixed(2)),
      distinctPostersByWeek: [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      topPosters: [...tempo.analytics.topPosters.map((p) => ({ ...p, chain: "Tempo" })), ...base.analytics.topPosters.map((p) => ({ ...p, chain: "Base" }))]
        .sort((a, b) => b.tasks - a.tasks)
        .slice(0, 12),
      topWinners: [...(tempo.analytics.topWinners || []).map((w) => ({ ...w, chain: "Tempo" })), ...(base.analytics.topWinners || []).map((w) => ({ ...w, chain: "Base" }))]
        .sort((a, b) => b.awards - a.awards || b.rewardUsd - a.rewardUsd)
        .slice(0, 12),
      flow: {
        cohortToMode: mergeFlow(tempo.analytics.flow.cohortToMode, base.analytics.flow.cohortToMode),
        modeToStatus: mergeFlow(tempo.analytics.flow.modeToStatus, base.analytics.flow.modeToStatus),
        modeToWinner: mergeFlow(tempo.analytics.flow.modeToWinner || [], base.analytics.flow.modeToWinner || []),
      },
      swarmConvergence: [...tempo.analytics.swarmConvergence, ...base.analytics.swarmConvergence]
        .sort((a, b) => b.submissions - a.submissions)
        .slice(0, 24),
    },
  };
}

function renderKPIs(c) {
  const h = c.headline;
  const a = c.analytics;
  const g = c.growth7d || {};
  const latestWk = a.distinctPostersByWeek[a.distinctPostersByWeek.length - 1];
  const cards = [
    { label: "Registered Workers", val: fmtInt(h.registeredWorkers), sub: "market-wide directory" },
    { label: "Active Agents (7d)", val: fmtInt(h.activeAgents7d), sub: `${fmtInt(h.activeWorkers7d)} workers · ${fmtDelta(g.agentsDeltaPct)}` },
    { label: "Open Tasks", val: fmtInt(h.openTasks), sub: `${c.meta.token} escrowed now` },
    { label: "Paid Workers", val: fmtInt(h.paidWorkers), sub: `${fmtInt(a.distinctWinnersTotal || 0)} indexed winners` },
    { label: "Indexed Volume", val: fmtUsd(a.indexedRewardVolumeUsd), sub: `${fmtInt(a.indexedTasksCount)} tasks indexed` },
    {
      label: "Posters This Week",
      val: fmtInt(latestWk ? latestWk.distinctPosters : 0),
      sub: `${fmtInt(a.distinctPostersTotal)} distinct total`,
    },
  ];
  document.getElementById("kpiGrid").innerHTML = cards
    .map(
      (k) => `<div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-val">${esc(k.val)}</div>
        <div class="kpi-sub">${esc(k.sub)}</div>
      </div>`
    )
    .join("");
}

function renderInsights(c) {
  const a = c.analytics;
  const g = c.growth7d || {};
  const dt = a.decisionTiming || {};

  const items = [
    {
      accent: true,
      kicker: "Demand & Winner Concentration",
      text: `Top 5 posters created ${a.top5SharePct}% of indexed tasks (${a.repeatPosters} repeat vs ${a.oneOffPosters} one-off); top 5 winners captured ${a.top5WinnerSharePct || 0}% of indexed awards.`,
    },
    {
      accent: false,
      kicker: "Tasks That Died vs Paid",
      text: `${a.completionRatePct}% settled paid while ${a.mortalityRatePct}% expired or cancelled without payout. See reward-tier mortality in Modes & Heatmaps.`,
    },
    {
      accent: false,
      kicker: "What Is Growing (7d WoW)",
      text: `Last 7 full days: ${fmtUsd(g.paidCurUsd || 0)} paid (${fmtDelta(g.paidDeltaPct)}) across ${fmtInt(g.tasksCur || 0)} new tasks (${fmtDelta(g.tasksDeltaPct)}).`,
    },
    {
      accent: false,
      kicker: "Time to a Decision",
      text: `Completed tasks carry a median ${dt.completedWindowMedianH || a.medianWindowHours}h window (p25 ${dt.completedWindowP25H || 0}h · p75 ${dt.completedWindowP75H || 0}h)${dt.observedDecisionMedianH !== null && dt.observedDecisionMedianH !== undefined ? `; recent feed completions settled in ${dt.observedDecisionMedianH}h median.` : "."}`,
    },
  ];
  document.getElementById("insightsGrid").innerHTML = items
    .map(
      (i) => `<div class="insight-card ${i.accent ? "accent" : ""}">
        <div class="insight-kicker">${esc(i.kicker)}</div>
        <p class="insight-text">${esc(i.text)}</p>
      </div>`
    )
    .join("");
}

function renderSankey(c) {
  const isWinnersMode = state.flowMetric === "winnersUsd";
  const valueKey = state.flowMetric === "tasks" ? "tasks" : "rewardUsd";
  const c2m = c.analytics.flow.cohortToMode.filter((e) => e[valueKey] > 0);
  const rightEdges = (isWinnersMode ? c.analytics.flow.modeToWinner || [] : c.analytics.flow.modeToStatus).filter(
    (e) => e[valueKey] > 0
  );

  const col0Names = ["Top 3 Posters", "Rank 4–10 Posters", "Long-Tail Posters"];
  const col1Names = [...new Set([...c2m.map((e) => e.target), ...rightEdges.map((e) => e.source)])];
  const col2Names = isWinnersMode
    ? ["Top 5 Winners", "Repeat Winners", "First-Time Winners", "Open / Active", "Expired / Cancelled"]
    : ["completed", "open", "in_progress", "expired", "cancelled"];

  const sumBy = (edges, field, names) =>
    names
      .map((name) => ({
        name,
        val: edges.filter((e) => e[field] === name).reduce((s, e) => s + e[valueKey], 0),
      }))
      .filter((x) => x.val > 0);

  const leftNodes = sumBy(c2m, "source", col0Names);
  const midNodes = sumBy(c2m, "target", col1Names);
  const rightNodes = sumBy(rightEdges, "target", col2Names);

  const W = 760, H = 344, padY = 24, nodeW = 14, gap = 14;
  const colX = [160, W / 2 - nodeW / 2, W - 186];

  const layoutCol = (nodes, x) => {
    const total = nodes.reduce((s, n) => s + n.val, 0) || 1;
    const availH = H - padY * 2 - gap * Math.max(0, nodes.length - 1);
    let y = padY;
    const out = new Map();
    for (const n of nodes) {
      const h = Math.max(10, (n.val / total) * availH);
      out.set(n.name, { ...n, x, y, h, outOff: 0, inOff: 0 });
      y += h + gap;
    }
    return out;
  };

  const L = layoutCol(leftNodes, colX[0]);
  const M = layoutCol(midNodes, colX[1]);
  const R = layoutCol(rightNodes, colX[2]);

  const rightColor = (name) => {
    if (name === "completed" || name === "Top 5 Winners") return PALETTE.paper;
    if (name === "open" || name === "Open / Active") return PALETTE.magenta;
    if (name === "in_progress" || name === "Repeat Winners" || name === "First-Time Winners") return PALETTE.salmon;
    return PALETTE.line;
  };

  let pathsSvg = "";
  const drawLinks = (edges, srcMap, dstMap, colorFn) => {
    for (const e of edges) {
      const s = srcMap.get(e.source);
      const t = dstMap.get(e.target);
      if (!s || !t) continue;
      const sh = Math.max(2, (e[valueKey] / (s.val || 1)) * s.h);
      const th = Math.max(2, (e[valueKey] / (t.val || 1)) * t.h);
      const y0 = s.y + s.outOff + sh / 2;
      const y1 = t.y + t.inOff + th / 2;
      s.outOff += sh;
      t.inOff += th;
      const x0 = s.x + nodeW;
      const x1 = t.x;
      const cx = (x0 + x1) / 2;
      const sw = Math.max(2, (sh + th) / 2);
      const label = `${e.source} → ${e.target}: ${valueKey === "tasks" ? fmtInt(e.tasks) + " tasks" : fmtUsd(e.rewardUsd)} (${fmtInt(e.tasks)} tasks)`;
      pathsSvg += `<path d="M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}" stroke="${colorFn(e)}" stroke-opacity="0.36" stroke-width="${sw.toFixed(1)}" fill="none" data-tip="${esc(label)}" />`;
    }
  };

  drawLinks(c2m, L, M, (e) => (e.source === "Top 3 Posters" ? PALETTE.magenta : PALETTE.salmon));
  drawLinks(rightEdges, M, R, (e) => rightColor(e.target));

  let nodesSvg = "";
  const drawNodes = (map, align, colorFn) => {
    for (const n of map.values()) {
      const valStr = valueKey === "tasks" ? fmtInt(n.val) : fmtUsd(n.val);
      const tx = align === "left" ? n.x - 8 : align === "right" ? n.x + nodeW + 8 : n.x + nodeW / 2;
      const anchor = align === "left" ? "end" : align === "right" ? "start" : "middle";
      const ty = align === "mid" ? n.y - 5 : n.y + n.h / 2 + 4;
      nodesSvg += `<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${colorFn(n.name)}" />`;
      nodesSvg += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="${PALETTE.cream}" font-size="11.2" font-family="Inter Tight">${esc(n.name)} <tspan fill="${PALETTE.muted}" font-family="Departure Mono" font-size="10.2">${esc(valStr)}</tspan></text>`;
    }
  };

  drawNodes(L, "left", (n) => (n === "Top 3 Posters" ? PALETTE.magenta : PALETTE.salmon));
  drawNodes(M, "mid", () => PALETTE.cream);
  drawNodes(R, "right", rightColor);

  const box = document.getElementById("sankeyBox");
  box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Capital and task flow diagram">${pathsSvg}${nodesSvg}</svg>`;
  box.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (ev) => showTip(ev, el.getAttribute("data-tip")));
    el.addEventListener("mouseleave", hideTip);
  });

  document.getElementById("sankeyLegend").innerHTML = isWinnersMode
    ? `
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.paper}"></span>Top 5 Winners ($)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.salmon}"></span>Repeat &amp; First-Time Winners</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.magenta}"></span>Top 3 Posters / Open Pools</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.line}"></span>Expired / Cancelled</span>
    `
    : `
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.magenta}"></span>Top 3 Posters / Open</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.paper}"></span>Completed (Paid)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.salmon}"></span>Mid/Long-Tail &amp; In-Progress</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.line}"></span>Expired / Cancelled</span>
    `;
}

function renderSwarmScatter(list) {
  const box = document.getElementById("swarmScatterBox");
  if (!list.length) {
    box.innerHTML = "";
    return;
  }
  const W = 500, H = 178, pL = 48, pR = 16, pT = 14, pB = 30;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const maxSubs = Math.max(10, ...list.map((x) => x.submissions));
  const minLog = Math.log10(0.05);
  const maxRew = Math.max(10, ...list.map((x) => x.rewardUsd));
  const maxLog = Math.log10(maxRew * 1.4);

  const yPos = (usd) => {
    const lv = Math.log10(Math.max(0.05, usd));
    const norm = (lv - minLog) / Math.max(0.1, maxLog - minLog);
    return pT + plotH - norm * plotH;
  };
  const xPos = (subs) => pL + (subs / maxSubs) * plotW;

  let grid = "";
  for (const tick of [0.1, 1, 10, 50]) {
    if (tick > maxRew * 1.35) continue;
    const y = yPos(tick);
    grid += `<line x1="${pL}" y1="${y.toFixed(1)}" x2="${W - pR}" y2="${y.toFixed(1)}" stroke="${PALETTE.line}" stroke-dasharray="2 3" />`;
    grid += `<text x="${pL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono" font-size="9.5">$${tick}</text>`;
  }
  grid += `<text x="${pL + plotW / 2}" y="${H - 6}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono" font-size="9.5">COMPETING SUBMISSIONS (0 → ${fmtInt(maxSubs)})</text>`;

  let dots = "";
  list.forEach((item, idx) => {
    const cx = xPos(item.submissions);
    const cy = yPos(item.rewardUsd);
    const r = Math.max(4.2, Math.min(11, 4.2 + Math.sqrt(item.rewardUsd) * 0.9));
    const fill = idx < 4 ? PALETTE.magenta : item.rewardUsd >= 5 ? PALETTE.paper : PALETTE.salmon;
    const hrsTxt = item.hoursLeft !== null && item.hoursLeft !== undefined ? ` · ${item.hoursLeft}h left` : "";
    const tip = `<strong>${esc(item.ref)}</strong> (${esc(item.mode)})<br>${esc(item.title)}<br>${fmtUsd(item.rewardUsd)} · ${fmtInt(item.submissions)} subs (${fmtUsd(item.rewardPerSubUsd)}/sub${hrsTxt})`;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" fill-opacity="0.78" stroke="${PALETTE.ground}" stroke-width="1.2" data-tip="${esc(tip)}" />`;
  });

  box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Swarm convergence scatter plot of reward versus competing submissions">${grid}${dots}</svg>`;
  box.querySelectorAll("[data-tip]").forEach((n) => {
    n.addEventListener("mousemove", (ev) => showTip(ev, n.getAttribute("data-tip")));
    n.addEventListener("mouseleave", hideTip);
  });
}

function renderSwarm(c) {
  const list = c.analytics.swarmConvergence || [];
  renderSwarmScatter(list);
  const maxSubs = Math.max(1, ...list.map((x) => x.submissions));
  const el = document.getElementById("swarmList");
  if (!list.length) {
    el.innerHTML = `<div class="panel-note">No open tasks indexed in snapshot.</div>`;
    return;
  }
  el.innerHTML = list
    .map((item, idx) => {
      const pct = Math.max(4, Math.round((item.submissions / maxSubs) * 100));
      const hrs = item.hoursLeft !== null && item.hoursLeft !== undefined ? ` · ${item.hoursLeft}h left` : "";
      return `<div class="swarm-row">
        <div class="swarm-top">
          <span class="swarm-ref">${esc(item.ref)} · ${esc(item.mode)} · ${esc(item.requesterShort)}${esc(hrs)}</span>
          <span class="swarm-metric">${fmtInt(item.submissions)} subs · ${fmtUsd(item.rewardUsd)}</span>
        </div>
        <div class="swarm-title" title="${esc(item.title)}">${esc(item.title)}</div>
        <div class="bar-track"><div class="bar-fill ${idx < 3 ? "hot" : ""}" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join("");
}

function renderChainCompare() {
  const t = state.snap.chains.tempo;
  const b = state.snap.chains.base;
  const rows = [
    ["Token / Chain ID", "OUSD · 4217", "USDC · 8453"],
    ["Active Wallets", fmtInt(t.headline.activeWallets), fmtInt(b.headline.activeWallets)],
    ["Paid Workers", fmtInt(t.headline.paidWorkers), fmtInt(b.headline.paidWorkers)],
    ["Indexed Tasks", fmtInt(t.analytics.indexedTasksCount), fmtInt(b.analytics.indexedTasksCount)],
    ["Distinct Task Posters", fmtInt(t.analytics.distinctPostersTotal), fmtInt(b.analytics.distinctPostersTotal)],
    ["Distinct Indexed Winners", fmtInt(t.analytics.distinctWinnersTotal || 0), fmtInt(b.analytics.distinctWinnersTotal || 0)],
    ["Top 5 Poster Share", `${t.analytics.top5SharePct}%`, `${b.analytics.top5SharePct}%`],
    ["Top 5 Winner Share", `${t.analytics.top5WinnerSharePct || 0}%`, `${b.analytics.top5WinnerSharePct || 0}%`],
    ["Completion Rate", `${t.analytics.completionRatePct}%`, `${b.analytics.completionRatePct}%`],
    ["Expired / Cancelled Rate", `${t.analytics.mortalityRatePct}%`, `${b.analytics.mortalityRatePct}%`],
    ["Median Reward", fmtUsd(t.analytics.medianRewardUsd), fmtUsd(b.analytics.medianRewardUsd)],
    ["Indexed Reward Volume", fmtUsd(t.analytics.indexedRewardVolumeUsd), fmtUsd(b.analytics.indexedRewardVolumeUsd)],
  ];
  document.getElementById("chainCompareTable").innerHTML = `<table>
    <thead><tr><th>Metric</th><th class="num">Tempo (4217)</th><th class="num">Base (8453)</th></tr></thead>
    <tbody>${rows.map(([k, v1, v2]) => `<tr><td>${esc(k)}</td><td class="num">${esc(v1)}</td><td class="num">${esc(v2)}</td></tr>`).join("")}</tbody>
  </table>`;
}

function renderDualChart(elId, rows, seriesA, seriesB, isUsd = false) {
  const el = document.getElementById(elId);
  if (!rows || !rows.length) {
    el.innerHTML = `<div class="panel-note">No time-series data for this range.</div>`;
    return;
  }
  const W = 540, H = 240, pL = 52, pR = 16, pT = 16, pB = 34;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const valsA = rows.map(seriesA.get);
  const valsB = rows.map(seriesB.get);
  const maxVal = Math.max(1, ...valsA, ...valsB);

  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const y = pT + (plotH * i) / 4;
    const v = maxVal * (1 - i / 4);
    const lbl = isUsd ? fmtUsd(v) : fmtInt(Math.round(v));
    grid += `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="${PALETTE.line}" stroke-dasharray="2 3" />`;
    grid += `<text x="${pL - 8}" y="${y + 4}" text-anchor="end" fill="${PALETTE.muted}" font-family="Departure Mono" font-size="10">${esc(lbl)}</text>`;
  }

  const step = plotW / rows.length;
  const barW = Math.max(3, Math.min(18, step * 0.62));
  let bars = "";
  let linePts = [];
  let hitAreas = "";

  rows.forEach((r, idx) => {
    const cx = pL + idx * step + step / 2;
    const vB = valsB[idx];
    const vA = valsA[idx];
    const hB = (vB / maxVal) * plotH;
    const yB = pT + plotH - hB;
    const yA = pT + plotH - (vA / maxVal) * plotH;

    bars += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${yB.toFixed(1)}" width="${barW.toFixed(1)}" height="${hB.toFixed(1)}" rx="2" fill="${seriesB.color}" fill-opacity="0.72" />`;
    linePts.push(`${cx.toFixed(1)},${yA.toFixed(1)}`);

    const tip = `${r.bucket}<br>${seriesA.label}: ${isUsd ? fmtUsd(vA) : fmtInt(vA)}<br>${seriesB.label}: ${isUsd ? fmtUsd(vB) : fmtInt(vB)}`;
    hitAreas += `<rect x="${(pL + idx * step).toFixed(1)}" y="${pT}" width="${step.toFixed(1)}" height="${plotH}" fill="transparent" data-tip="${esc(tip)}" />`;
  });

  const labelIdx = [0, Math.floor(rows.length / 2), rows.length - 1];
  let xLabels = "";
  for (const idx of [...new Set(labelIdx)]) {
    const cx = pL + idx * step + step / 2;
    xLabels += `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono" font-size="10">${esc(rows[idx].bucket)}</text>`;
  }

  const poly = `<polyline fill="none" stroke="${seriesA.color}" stroke-width="2.2" points="${linePts.join(" ")}" />`;
  const dots = rows.length <= 35
    ? linePts
        .map((pt) => {
          const [x, y] = pt.split(",");
          return `<circle cx="${x}" cy="${y}" r="2.6" fill="${seriesA.color}" />`;
        })
        .join("")
    : "";

  el.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${grid}${bars}${poly}${dots}${xLabels}${hitAreas}</svg>`;
  el.querySelectorAll("[data-tip]").forEach((n) => {
    n.addEventListener("mousemove", (ev) => showTip(ev, n.getAttribute("data-tip")));
    n.addEventListener("mouseleave", hideTip);
  });
}

function renderTimeSeries(c) {
  const g = c.growth7d || {};
  const gCards = [
    { label: "7d Tasks Posted", val: fmtInt(g.tasksCur), prev: `prior 7d: ${fmtInt(g.tasksPrev)}`, delta: g.tasksDeltaPct },
    { label: "7d Rewards Paid", val: fmtUsd(g.paidCurUsd), prev: `prior 7d: ${fmtUsd(g.paidPrevUsd)}`, delta: g.paidDeltaPct },
    { label: "7d Rewards Escrowed", val: fmtUsd(g.escrowedCurUsd), prev: `prior 7d: ${fmtUsd(g.escrowedPrevUsd)}`, delta: g.escrowedDeltaPct },
    { label: "Avg Daily Agents", val: String(g.avgAgentsCur ?? 0), prev: `prior 7d: ${g.avgAgentsPrev ?? 0}`, delta: g.agentsDeltaPct },
  ];
  document.getElementById("growthStrip").innerHTML = gCards
    .map((x) => {
      const cls = x.delta !== null && x.delta !== undefined ? (x.delta >= 0 ? "up" : "down") : "";
      return `<div class="growth-card">
        <div class="growth-top">
          <span class="kpi-label" style="margin:0;">${esc(x.label)}</span>
          <span class="delta-pill ${cls}">${esc(fmtDelta(x.delta))}</span>
        </div>
        <div class="kpi-val">${esc(x.val)}</div>
        <div class="kpi-sub">${esc(x.prev)}</div>
      </div>`;
    })
    .join("");

  const effectiveBucket = state.range === "7d" || state.range === "30d" ? "day" : state.bucket;
  const key = `${state.range}_${effectiveBucket}`;
  const rows = c.timeSeries[key] || c.timeSeries["30d_day"] || [];

  renderDualChart(
    "tsAgentsChart",
    rows,
    { label: "Active Agents", color: PALETTE.magenta, get: (r) => Number(r.activeAgents || 0) },
    { label: "Tasks Posted", color: PALETTE.salmon, get: (r) => Number(r.tasksCreated || 0) },
    false
  );
  renderDualChart(
    "tsVolumeChart",
    rows,
    { label: "Rewards Paid", color: PALETTE.paper, get: (r) => Number(r.paidVolume || 0) / 1e6 },
    { label: "Rewards Escrowed", color: PALETTE.salmon, get: (r) => Number(r.rewardVolume || 0) / 1e6 },
    true
  );
}

function renderPosters(c) {
  const weeks = c.analytics.distinctPostersByWeek || [];
  renderDualChart(
    "postersWeekChart",
    weeks.map((w) => ({ ...w, bucket: w.isoWeek })),
    { label: "Distinct Posters", color: PALETTE.magenta, get: (w) => w.distinctPosters },
    { label: "Tasks Posted", color: PALETTE.line, get: (w) => w.tasks },
    false
  );

  const total = c.analytics.indexedTasksCount || 1;
  document.getElementById("topPostersTable").innerHTML = `<table>
    <thead><tr><th>#</th><th>Wallet Prefix</th><th class="num">Tasks</th><th class="num">Share</th><th class="num">Volume</th></tr></thead>
    <tbody>${c.analytics.topPosters
      .map(
        (p, i) => `<tr>
          <td class="mono">${i + 1}</td>
          <td class="mono">${esc(p.walletShort)}${p.chain ? ` <span style="color:var(--muted)">(${esc(p.chain)})</span>` : ""}</td>
          <td class="num">${fmtInt(p.tasks)}</td>
          <td class="num">${((p.tasks / total) * 100).toFixed(1)}%</td>
          <td class="num">${fmtUsd(p.rewardUsd)}</td>
        </tr>`
      )
      .join("")}</tbody>
  </table>`;

  const winners = c.analytics.topWinners || [];
  const totalAwards = winners.reduce((s, w) => s + w.awards, 0) || 1;
  document.getElementById("topWinnersTable").innerHTML = winners.length
    ? `<table>
      <thead><tr><th>#</th><th>Worker Prefix</th><th class="num">Awards Won</th><th class="num">Top-12 Share</th><th class="num">Indexed Volume</th><th class="num">Distinct Posters</th></tr></thead>
      <tbody>${winners
        .map(
          (w, i) => `<tr>
            <td class="mono">${i + 1}</td>
            <td class="mono">${esc(w.walletShort)}${w.chain ? ` <span style="color:var(--muted)">(${esc(w.chain)})</span>` : ""}</td>
            <td class="num">${fmtInt(w.awards)}</td>
            <td class="num">${((w.awards / totalAwards) * 100).toFixed(1)}%</td>
            <td class="num">${fmtUsd(w.rewardUsd)}</td>
            <td class="num">${fmtInt(w.distinctRequesters || 0)}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>`
    : `<div class="panel-note">No completed awards indexed for this selection.</div>`;
}

function renderBreakdownsAndHeatmap(c) {
  const renderBars = (elId, list, key, accentKey) => {
    const sorted = [...(list || [])].sort((a, b) => b.count - a.count);
    const total = sorted.reduce((s, x) => s + x.count, 0) || 1;
    const max = Math.max(1, ...sorted.map((x) => x.count));
    document.getElementById(elId).innerHTML = sorted
      .map((item) => {
        const pct = ((item.count / total) * 100).toFixed(1);
        const w = Math.max(3, (item.count / max) * 100);
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
            <span style="font-family:var(--font-mono);font-size:12px;">${esc(item[key])}</span>
            <span style="font-family:var(--font-mono);font-size:12px;color:var(--muted);">${fmtInt(item.count)} (${pct}%)</span>
          </div>
          <div class="bar-track"><div class="bar-fill ${item[key] === accentKey ? "hot" : ""}" style="width:${w}%"></div></div>
        </div>`;
      })
      .join("");
  };

  renderBars("modeBars", c.breakdowns.mode, "mode", "bounty");
  renderBars("statusBars", c.breakdowns.status, "status", "completed");

  // Reward-tier mortality stacked bars
  const tiers = c.analytics.mortalityByTier || [];
  document.getElementById("mortalityTierBox").innerHTML = tiers
    .map((t) => {
      const denom = t.total || 1;
      const pPaid = ((t.completed / denom) * 100).toFixed(1);
      const pOpen = ((t.open / denom) * 100).toFixed(1);
      const pDead = ((t.dead / denom) * 100).toFixed(1);
      return `<div style="margin-bottom:11px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;font-family:var(--font-mono);">
          <span style="color:var(--paper)">${esc(t.tier)} <span style="color:var(--muted)">(${fmtInt(t.total)} tasks · ${fmtUsd(t.rewardUsd)})</span></span>
          <span style="color:var(--salmon)">${pPaid}% paid · ${pDead}% died</span>
        </div>
        <div class="stacked-track" title="${esc(`${t.tier}: ${t.completed} completed, ${t.open} open, ${t.dead} expired/cancelled`)}">
          <div class="seg-paid" style="width:${pPaid}%"></div>
          <div class="seg-open" style="width:${pOpen}%"></div>
          <div class="seg-dead" style="width:${pDead}%"></div>
        </div>
      </div>`;
    })
    .join("");

  // Decision timing summary grid
  const dt = c.analytics.decisionTiming || {};
  const claimVal =
    dt.medianClaimMinutes !== null && dt.medianClaimMinutes !== undefined
      ? dt.medianClaimMinutes >= 60
        ? `${(dt.medianClaimMinutes / 60).toFixed(1)}h`
        : `${dt.medianClaimMinutes} min`
      : "—";
  const timingCells = [
    {
      label: "Completed Task Window (Median)",
      val: `${dt.completedWindowMedianH ?? c.analytics.medianWindowHours}h`,
      sub: `IQR: ${dt.completedWindowP25H ?? 0}h – ${dt.completedWindowP75H ?? 0}h`,
    },
    {
      label: "Dead Task Window (Median)",
      val: `${dt.deadWindowMedianH ?? 0}h`,
      sub: "expired or cancelled lifespan",
    },
    {
      label: "Median Time to Claim",
      val: claimVal,
      sub: `${fmtInt(dt.claimSamples || 0)} claimed tasks indexed`,
    },
    dt.observedDecisionMedianH !== null && dt.observedDecisionMedianH !== undefined
      ? {
          label: "Recent Observed Decision Time",
          val: `${dt.observedDecisionMedianH}h`,
          sub: `${fmtInt(dt.observedDecisionSamples || 0)} matched feed completions`,
        }
      : {
          label: "Competing Subs at Decision",
          val: `${dt.completedSubsMedian ?? 0} subs`,
          sub: `median paid vs ${dt.deadSubsMedian ?? 0} on dead tasks`,
        },
  ];
  document.getElementById("decisionTimingBox").innerHTML = `<div class="timing-grid">${timingCells
    .map(
      (cell) => `<div class="timing-cell">
        <div class="timing-label">${esc(cell.label)}</div>
        <div class="timing-val">${esc(cell.val)}</div>
        <div class="timing-sub">${esc(cell.sub)}</div>
      </div>`
    )
    .join("")}</div>`;

  // Heatmap
  const hm = state.heatmapDim === "hourOfWeek" ? c.heatmaps.hourOfWeek : c.heatmaps.mode;
  const rows = hm?.rowKeys || [];
  const cols = hm?.colKeys || [];
  const cellMap = new Map();
  let maxC = 1;
  for (const cell of hm?.cells || []) {
    const cnt = Number(cell.count || 0);
    cellMap.set(`${cell.row}::${cell.col}`, cnt);
    if (cnt > maxC) maxC = cnt;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cellW = state.heatmapDim === "hourOfWeek" ? 28 : 22;
  const cellH = 26;
  const pL = state.heatmapDim === "hourOfWeek" ? 46 : 86;
  const pT = 26;
  const W = pL + cols.length * cellW + 14;
  const H = pT + rows.length * cellH + 14;

  let svg = "";
  cols.forEach((col, ci) => {
    const show = state.heatmapDim === "hourOfWeek" ? ci % 2 === 0 : ci % 4 === 0;
    if (show) {
      const lbl = state.heatmapDim === "hourOfWeek" ? `${col}h` : col.slice(5);
      svg += `<text x="${pL + ci * cellW + cellW / 2}" y="16" text-anchor="middle" fill="${PALETTE.muted}" font-family="Departure Mono" font-size="9.5">${esc(lbl)}</text>`;
    }
  });

  rows.forEach((row, ri) => {
    const rLabel = state.heatmapDim === "hourOfWeek" ? dayNames[Number(row)] || row : row;
    svg += `<text x="${pL - 8}" y="${pT + ri * cellH + 17}" text-anchor="end" fill="${PALETTE.cream}" font-family="Departure Mono" font-size="10.5">${esc(rLabel)}</text>`;
    cols.forEach((col, ci) => {
      const cnt = cellMap.get(`${row}::${col}`) || 0;
      const ratio = cnt / maxC;
      let fill = PALETTE.ground;
      if (ratio > 0.78) fill = PALETTE.magenta;
      else if (ratio > 0.45) fill = PALETTE.salmon;
      else if (ratio > 0.15) fill = "#6E3A46";
      else if (cnt > 0) fill = PALETTE.maroon;
      const tip = `${rLabel} · ${col}: ${fmtInt(cnt)} events`;
      svg += `<rect x="${pL + ci * cellW + 2}" y="${pT + ri * cellH + 2}" width="${cellW - 4}" height="${cellH - 4}" rx="4" fill="${fill}" stroke="${PALETTE.line}" stroke-width="0.6" data-tip="${esc(tip)}" />`;
    });
  });

  const box = document.getElementById("heatmapBox");
  box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${svg}</svg>`;
  box.querySelectorAll("[data-tip]").forEach((n) => {
    n.addEventListener("mousemove", (ev) => showTip(ev, n.getAttribute("data-tip")));
    n.addEventListener("mouseleave", hideTip);
  });
}

function renderFeed(c) {
  const list = (c.activityFeed || []).filter((i) => state.feedType === "all" || i.type === state.feedType);
  const el = document.getElementById("feedList");
  if (!list.length) {
    el.innerHTML = `<div class="panel-note">No events matching filter "${esc(state.feedType)}".</div>`;
    return;
  }
  el.innerHTML = list
    .map((i) => {
      const cls = i.type.includes("completed") || i.type.includes("paid") ? "paid" : i.type.includes("created") ? "created" : "";
      const chainTag = i.chainId === 4217 ? "Tempo" : "Base";
      const amt = i.amountUsd ? ` · ${fmtUsd(i.amountUsd)}` : "";
      const agent = i.actorAgentId ? `agent #${i.actorAgentId}` : i.actorShort;
      return `<div class="feed-item">
        <span class="badge ${cls}">${esc(i.type.replaceAll("_", " "))}</span>
        <div>
          <div style="color:var(--paper);font-size:13.5px;">${esc(i.taskTitle || i.taskId.slice(0, 14))}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted);">${esc(chainTag)} · ${esc(agent)} (${esc(i.actorType)})${esc(amt)}</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--muted);white-space:nowrap;">${esc(i.timestamp.slice(0, 16).replace("T", " "))}Z</div>
      </div>`;
    })
    .join("");
}

function renderMethods() {
  const s = state.snap;
  const eps = (s.endpointsUsed || []).map((e) => `<li><code>${esc(s.sourceBaseUrl + e)}</code></li>`).join("");
  document.getElementById("methodsContent").innerHTML = `
    <p><strong>Data as of:</strong> <span style="font-family:var(--font-mono);color:var(--paper)">${esc(s.dataAsOf)}</span> · <span style="font-family:var(--font-mono);color:var(--salmon)">schema v${esc(s.schemaVersion || "1.2.0")}</span></p>
    <p><strong>Server-side refresh:</strong> ${esc(s.refreshCadence)}. Browser clients never query <code>api.taskmarket.dev</code> directly; all views load a single cached JSON snapshot (<code>./data/snapshot.json</code>) served over HTTPS with <code>Cache-Control</code>.</p>
    <p><strong>Endpoints queried:</strong></p>
    <ul style="font-family:var(--font-mono);font-size:12px;line-height:1.8;color:var(--cream);">${eps}</ul>
    <p><strong>Derived metrics &amp; reproducibility:</strong></p>
    <ul style="color:var(--muted);font-size:13.5px;line-height:1.7;">
      <li><strong>Distinct task posters per week:</strong> Paginates <code>/api/tasks?chainId=…&amp;sort=newest&amp;limit=100</code> across all pages, groups each task by its Monday-anchored ISO week from <code>createdAt</code>, and counts unique lowercased <code>requester</code> wallet addresses.</li>
      <li><strong>Poster → Mode → Winner Capital Flow:</strong> Ranks requester addresses strictly by indexed task count and awarded workers strictly by <code>primaryAward.workerAddress</code> award count (hex prefixes only; zero guessed identities). Every Sankey layer conserves 100% of indexed tasks and dollar volume.</li>
      <li><strong>Reward-Tier Mortality &amp; Decision Timing:</strong> Partitions indexed tasks into <code>&lt;$0.50</code>, <code>$0.50–$2</code>, <code>$2–$10</code>, and <code>$10+</code> bands; computes p25/median/p75 submission windows (<code>expiryTime - createdAt</code>), claim latency (<code>claimedAt - createdAt</code>), and observed completion latency for matched <code>task_completed</code> feed events.</li>
      <li><strong>7-Day Growth Velocity (WoW):</strong> Compares the last 7 complete UTC days against the prior 7 complete UTC days from <code>/api/stats/platform-time-series?range=30d&amp;bucket=day</code> (excluding the in-progress current UTC day).</li>
      <li><strong>Self-hosting &amp; Verification:</strong> Run <code>npm run build &amp;&amp; npm run verify &amp;&amp; npm test &amp;&amp; npm start</code> (Node 20+, zero npm dependencies) or enable GitHub Pages on <code>/docs</code>.</li>
    </ul>
  `;
}

function renderAll() {
  if (!state.snap) return;
  const c = getActiveChainData();
  document.getElementById("dataAsOf").textContent = `Data as of ${state.snap.dataAsOf.slice(0, 16).replace("T", " ")} UTC`;

  document.querySelectorAll("#chainSwitch .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.chain === state.chain));
  document.querySelectorAll("#viewTabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.querySelectorAll("#flowMetricSwitch .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.metric === state.flowMetric));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${state.view}`));

  renderKPIs(c);
  renderInsights(c);
  if (state.view === "overview") {
    renderSankey(c);
    renderSwarm(c);
    renderChainCompare();
  } else if (state.view === "timeseries") {
    renderTimeSeries(c);
  } else if (state.view === "posters") {
    renderPosters(c);
  } else if (state.view === "heatmap") {
    renderBreakdownsAndHeatmap(c);
  } else if (state.view === "feed") {
    renderFeed(c);
  } else if (state.view === "methods") {
    renderMethods();
  }
  syncHash();
}

function wireEvents() {
  document.getElementById("chainSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chain]");
    if (!b) return;
    state.chain = b.dataset.chain;
    renderAll();
  });
  document.getElementById("viewTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    state.view = b.dataset.view;
    renderAll();
  });
  document.getElementById("flowMetricSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-metric]");
    if (!b) return;
    state.flowMetric = b.dataset.metric;
    document.querySelectorAll("#flowMetricSwitch .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderSankey(getActiveChainData());
    syncHash();
  });
  document.getElementById("rangeSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]");
    if (!b) return;
    state.range = b.dataset.range;
    document.querySelectorAll("#rangeSwitch .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderTimeSeries(getActiveChainData());
    syncHash();
  });
  document.getElementById("bucketSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bucket]");
    if (!b) return;
    state.bucket = b.dataset.bucket;
    document.querySelectorAll("#bucketSwitch .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderTimeSeries(getActiveChainData());
  });
  document.getElementById("heatmapDimSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dim]");
    if (!b) return;
    state.heatmapDim = b.dataset.dim;
    document.querySelectorAll("#heatmapDimSwitch .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderBreakdownsAndHeatmap(getActiveChainData());
  });
  document.getElementById("feedFilter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    state.feedType = b.dataset.type;
    document.querySelectorAll("#feedFilter .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderFeed(getActiveChainData());
  });

  const modal = document.getElementById("shareModal");
  document.getElementById("openShareBtn").addEventListener("click", () => {
    const card = VIEW_CARDS[state.view] || "og-overview.png";
    document.getElementById("shareCardImg").src = `./${card}?t=${Date.now()}`;
    document.getElementById("downloadCardLink").href = `./${card}`;
    document.getElementById("shareUrlBox").textContent = location.href;
    modal.classList.add("open");
  });
  document.getElementById("closeShareBtn").addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
  document.getElementById("copyLinkBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      document.getElementById("copyLinkBtn").textContent = "Copied!";
      setTimeout(() => (document.getElementById("copyLinkBtn").textContent = "Copy deep link"), 1500);
    } catch {
      document.getElementById("copyLinkBtn").textContent = "Select URL above";
    }
  });

  window.addEventListener("hashchange", () => {
    parseHash();
    renderAll();
  });
}

async function init() {
  parseHash();
  wireEvents();
  const res = await fetch("./data/snapshot.json", { cache: "default" });
  state.snap = await res.json();
  renderAll();
}

init().catch((err) => {
  document.getElementById("dataAsOf").textContent = `Snapshot load error: ${err.message}`;
});
