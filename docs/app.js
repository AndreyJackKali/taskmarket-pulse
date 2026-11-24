/**
 * Taskmarket Pulse — Client Renderer (Zero External Dependencies, Read-Only, No Tracking)
 * Reads strictly from server-cached ./data/snapshot.json (zero browser calls to api.taskmarket.dev).
 */

const state = {
  snap: null,
  chain: "tempo", // tempo | base | both
  view: "overview", // overview | timeseries | posters | heatmap | feed | methods
  range: "30d", // 7d | 30d | 90d | all
  bucket: "day", // day | week
  flowMetric: "tasks", // tasks | rewardUsd
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
  timeseries: "og-overview.png",
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
  if (v && ["overview", "timeseries", "posters", "heatmap", "feed", "methods"].includes(v)) state.view = v;
  if (c && ["tempo", "base", "both"].includes(c)) state.chain = c;
  if (r && ["7d", "30d", "90d", "all"].includes(r)) state.range = r;
}

function syncHash() {
  const params = new URLSearchParams({ view: state.view, chain: state.chain });
  if (state.view === "timeseries") params.set("range", state.range);
  history.replaceState(null, "", `#${params.toString()}`);
}

const tipEl = document.getElementById("tooltip");
function showTip(ev, html) {
  tipEl.innerHTML = html;
  tipEl.style.display = "block";
  const x = Math.min(window.innerWidth - 295, ev.clientX + 14);
  const y = Math.min(window.innerHeight - 120, ev.clientY + 14);
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

  // Combine Tempo + Base cleanly where additive; mark cross-chain globals explicitly
  const mergeCountArrays = (a = [], b = [], key) => {
    const map = new Map();
    for (const row of [...a, ...b]) {
      map.set(row[key], (map.get(row[key]) || 0) + Number(row.count || 0));
    }
    return [...map.entries()].map(([k, count]) => ({ [key]: k, count }));
  };

  const mergeTimeSeries = (k) => {
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

  const mergeFlow = (listA, listB) => {
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
      top3SharePct: tempo.analytics.top3SharePct,
      top5SharePct: tempo.analytics.top5SharePct,
      top10SharePct: tempo.analytics.top10SharePct,
      completionRatePct: Number(weightedComp.toFixed(1)),
      mortalityRatePct: Number(weightedMort.toFixed(1)),
      medianRewardUsd: tempo.analytics.medianRewardUsd,
      medianWindowHours: tempo.analytics.medianWindowHours,
      indexedRewardVolumeUsd: Number((tempo.analytics.indexedRewardVolumeUsd + base.analytics.indexedRewardVolumeUsd).toFixed(2)),
      distinctPostersByWeek: [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      topPosters: [...tempo.analytics.topPosters.map((p) => ({ ...p, chain: "Tempo" })), ...base.analytics.topPosters.map((p) => ({ ...p, chain: "Base" }))]
        .sort((a, b) => b.tasks - a.tasks)
        .slice(0, 12),
      flow: {
        cohortToMode: mergeFlow(tempo.analytics.flow.cohortToMode, base.analytics.flow.cohortToMode),
        modeToStatus: mergeFlow(tempo.analytics.flow.modeToStatus, base.analytics.flow.modeToStatus),
      },
      swarmConvergence: [...tempo.analytics.swarmConvergence, ...base.analytics.swarmConvergence]
        .sort((a, b) => b.submissions - a.submissions)
        .slice(0, 18),
    },
  };
}

function renderKPIs(c) {
  const h = c.headline;
  const a = c.analytics;
  const latestWk = a.distinctPostersByWeek[a.distinctPostersByWeek.length - 1];
  const cards = [
    { label: "Registered Workers", val: fmtInt(h.registeredWorkers), sub: "market-wide directory" },
    { label: "Active Agents (7d)", val: fmtInt(h.activeAgents7d), sub: `${fmtInt(h.activeWorkers7d)} active workers` },
    { label: "Open Tasks", val: fmtInt(h.openTasks), sub: `${c.meta.token} escrowed now` },
    { label: "Paid Workers", val: fmtInt(h.paidWorkers), sub: `${fmtInt(h.activeWallets)} active wallets` },
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
  const ts7 = c.timeSeries["7d_day"] || [];
  const paid7d = ts7.reduce((s, r) => s + Number(r.paidVolume || 0) / 1e6, 0);
  const esc7d = ts7.reduce((s, r) => s + Number(r.rewardVolume || 0) / 1e6, 0);
  const ratio = esc7d > 0 ? Math.round((paid7d / esc7d) * 100) : 0;

  const items = [
    {
      accent: true,
      kicker: "Supply Concentration",
      text: `Top 5 requester wallets created ${a.top5SharePct}% of indexed tasks (${a.repeatPosters} repeat posters vs ${a.oneOffPosters} one-off wallets).`,
    },
    {
      accent: false,
      kicker: "Task Mortality vs Settlement",
      text: `${a.completionRatePct}% of indexed tasks completed; ${a.mortalityRatePct}% expired or were cancelled without payout.`,
    },
    {
      accent: false,
      kicker: "7-Day Payout Velocity",
      text: `${fmtUsd(paid7d)} paid out against ${fmtUsd(esc7d)} escrowed over the last 7 days (${ratio}% payout-to-escrow ratio).`,
    },
    {
      accent: false,
      kicker: "Typical Bounty Shape",
      text: `Median task reward is ${fmtUsd(a.medianRewardUsd)} (${c.meta.token}) with a median submission window of ${a.medianWindowHours} hours.`,
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
  const metric = state.flowMetric;
  const c2m = c.analytics.flow.cohortToMode.filter((e) => e[metric] > 0);
  const m2s = c.analytics.flow.modeToStatus.filter((e) => e[metric] > 0);

  const col0Names = ["Top 3 Posters", "Rank 4–10 Posters", "Long-Tail Posters"];
  const col1Names = [...new Set([...c2m.map((e) => e.target), ...m2s.map((e) => e.source)])];
  const col2Names = ["completed", "open", "in_progress", "expired", "cancelled"];

  const sumBy = (edges, field, names) =>
    names
      .map((name) => ({
        name,
        val: edges.filter((e) => e[field] === name).reduce((s, e) => s + e[metric], 0),
      }))
      .filter((x) => x.val > 0);

  const leftNodes = sumBy(c2m, "source", col0Names);
  const midNodes = sumBy(c2m, "target", col1Names);
  const rightNodes = sumBy(m2s, "target", col2Names);

  const W = 740, H = 340, padY = 24, nodeW = 14, gap = 14;
  const colX = [156, W / 2 - nodeW / 2, W - 160];

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

  const statusColor = (name) => {
    if (name === "completed") return PALETTE.paper;
    if (name === "open") return PALETTE.magenta;
    if (name === "in_progress") return PALETTE.salmon;
    return PALETTE.line;
  };

  let pathsSvg = "";
  const drawLinks = (edges, srcMap, dstMap, colorFn) => {
    for (const e of edges) {
      const s = srcMap.get(e.source);
      const t = dstMap.get(e.target);
      if (!s || !t) continue;
      const sh = Math.max(2, (e[metric] / (s.val || 1)) * s.h);
      const th = Math.max(2, (e[metric] / (t.val || 1)) * t.h);
      const y0 = s.y + s.outOff + sh / 2;
      const y1 = t.y + t.inOff + th / 2;
      s.outOff += sh;
      t.inOff += th;
      const x0 = s.x + nodeW;
      const x1 = t.x;
      const cx = (x0 + x1) / 2;
      const sw = Math.max(2, (sh + th) / 2);
      const label = `${e.source} → ${e.target}: ${metric === "tasks" ? fmtInt(e.tasks) + " tasks" : fmtUsd(e.rewardUsd)}`;
      pathsSvg += `<path d="M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}" stroke="${colorFn(e)}" stroke-opacity="0.34" stroke-width="${sw.toFixed(1)}" fill="none" data-tip="${esc(label)}" />`;
    }
  };

  drawLinks(c2m, L, M, (e) => (e.source === "Top 3 Posters" ? PALETTE.magenta : PALETTE.salmon));
  drawLinks(m2s, M, R, (e) => statusColor(e.target));

  let nodesSvg = "";
  const drawNodes = (map, align, colorFn) => {
    for (const n of map.values()) {
      const valStr = metric === "tasks" ? fmtInt(n.val) : fmtUsd(n.val);
      const tx = align === "left" ? n.x - 8 : align === "right" ? n.x + nodeW + 8 : n.x + nodeW / 2;
      const anchor = align === "left" ? "end" : align === "right" ? "start" : "middle";
      const ty = align === "mid" ? n.y - 5 : n.y + n.h / 2 + 4;
      nodesSvg += `<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${colorFn(n.name)}" />`;
      nodesSvg += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="${PALETTE.cream}" font-size="11.5" font-family="Inter Tight">${esc(n.name)} <tspan fill="${PALETTE.muted}" font-family="Departure Mono" font-size="10.5">${esc(valStr)}</tspan></text>`;
    }
  };

  drawNodes(L, "left", (n) => (n === "Top 3 Posters" ? PALETTE.magenta : PALETTE.salmon));
  drawNodes(M, "mid", () => PALETTE.cream);
  drawNodes(R, "right", statusColor);

  const box = document.getElementById("sankeyBox");
  box.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Capital and task flow diagram">${pathsSvg}${nodesSvg}</svg>`;
  box.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (ev) => showTip(ev, el.getAttribute("data-tip")));
    el.addEventListener("mouseleave", hideTip);
  });

  document.getElementById("sankeyLegend").innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.magenta}"></span>Top 3 Posters / Open</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.paper}"></span>Completed (Paid)</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.salmon}"></span>Mid/Long-Tail &amp; In-Progress</span>
    <span class="legend-item"><span class="legend-swatch" style="background:${PALETTE.line}"></span>Expired / Cancelled</span>
  `;
}

function renderSwarm(c) {
  const list = c.analytics.swarmConvergence || [];
  const maxSubs = Math.max(1, ...list.map((x) => x.submissions));
  const el = document.getElementById("swarmList");
  if (!list.length) {
    el.innerHTML = `<div class="panel-note">No open tasks indexed in snapshot.</div>`;
    return;
  }
  el.innerHTML = list
    .map((item, idx) => {
      const pct = Math.max(4, Math.round((item.submissions / maxSubs) * 100));
      return `<div class="swarm-row">
        <div class="swarm-top">
          <span class="swarm-ref">${esc(item.ref)} · ${esc(item.mode)} · ${esc(item.requesterShort)}</span>
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
    ["Top 5 Poster Share", `${t.analytics.top5SharePct}%`, `${b.analytics.top5SharePct}%`],
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
  // Valid keys: 7d_day, 30d_day, 90d_day, 90d_week, all_day, all_week
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
    <p><strong>Data as of:</strong> <span style="font-family:var(--font-mono);color:var(--paper)">${esc(s.dataAsOf)}</span></p>
    <p><strong>Server-side refresh:</strong> ${esc(s.refreshCadence)}. Browser clients never query <code>api.taskmarket.dev</code> directly; all views load a single cached JSON snapshot (<code>./data/snapshot.json</code>) served over HTTPS with <code>Cache-Control</code>.</p>
    <p><strong>Endpoints queried:</strong></p>
    <ul style="font-family:var(--font-mono);font-size:12px;line-height:1.8;color:var(--cream);">${eps}</ul>
    <p><strong>Derived metrics &amp; reproducibility:</strong></p>
    <ul style="color:var(--muted);font-size:13.5px;line-height:1.7;">
      <li><strong>Distinct task posters per week:</strong> Paginates <code>/api/tasks?chainId=…&amp;sort=newest&amp;limit=100</code> across all pages, groups each task by its Monday-anchored ISO week from <code>createdAt</code>, and counts unique lowercased <code>requester</code> wallet addresses.</li>
      <li><strong>Poster concentration &amp; Capital Flow:</strong> Ranks requester addresses strictly by indexed task count into Top 3, Rank 4–10, and Long-Tail cohorts, mapping flows through <code>mode</code> into lifecycle outcomes. No off-chain names or guessed identities are attached to any wallet.</li>
      <li><strong>Self-hosting:</strong> Run <code>npm run build &amp;&amp; npm start</code> (Node 20+, zero npm dependencies) or enable GitHub Pages on <code>/docs</code>.</li>
    </ul>
  `;
}

function renderAll() {
  if (!state.snap) return;
  const c = getActiveChainData();
  document.getElementById("dataAsOf").textContent = `Data as of ${state.snap.dataAsOf.slice(0, 16).replace("T", " ")} UTC`;

  document.querySelectorAll("#chainSwitch .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.chain === state.chain));
  document.querySelectorAll("#viewTabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
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

  // Share modal
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
