/**
 * Taskmarket Pulse — Read-only Live Market Visualizer
 * Zero runtime dependencies. Fetches server-generated ./data/snapshot.json.
 * MIT License — built for Taskmarket bounty TSK-BRK611AN.
 */

const state = {
  snapshot: null,
  chain: 'tempo',       // tempo | base | both
  range: '30d',         // 7d | 30d | 90d | all_day | all_week
  view: 'all',          // all | flow | timeseries | posters | heatmap | feed
  flowMetric: 'reward', // reward | count
  heatmapDim: 'hourOfWeek', // hourOfWeek | mode
  feedType: 'all',
};

const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtUsd = (n, decimals = 2) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtShortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || '—');
const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const tooltip = document.getElementById('tooltip');
function showTip(evt, html) {
  tooltip.innerHTML = html;
  tooltip.classList.add('show');
  const pad = 14;
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  const r = tooltip.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 10) x = evt.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 10) y = evt.clientY - r.height - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}
function hideTip() {
  tooltip.classList.remove('show');
}

function readUrlState() {
  const p = new URLSearchParams(window.location.search);
  const c = p.get('chain');
  const r = p.get('range');
  const v = p.get('view') || window.location.hash.replace('#', '');
  if (['tempo', 'base', 'both'].includes(c)) state.chain = c;
  if (['7d', '30d', '90d', 'all_day', 'all_week'].includes(r)) state.range = r;
  if (['all', 'flow', 'timeseries', 'posters', 'heatmap', 'feed'].includes(v)) state.view = v;
}

function syncUrlState() {
  const p = new URLSearchParams();
  p.set('chain', state.chain);
  p.set('range', state.range);
  if (state.view !== 'all') p.set('view', state.view);
  const next = `${window.location.pathname}?${p.toString()}${state.view !== 'all' ? '#' + state.view : ''}`;
  window.history.replaceState(null, '', next);
}

function getActiveChainObj() {
  if (!state.snapshot) return null;
  if (state.chain === 'tempo') return state.snapshot.chains.tempo;
  if (state.chain === 'base') return state.snapshot.chains.base;
  return mergeChains(state.snapshot.chains.tempo, state.snapshot.chains.base);
}

function mergeChains(t, b) {
  // Combine chain-specific task analytics cleanly for "Compare Both" mode
  const weeks = new Map();
  for (const w of t.analytics.weeklyPosters) {
    weeks.set(w.week, { week: w.week, weekStart: w.weekStart, distinctPosters: w.distinctPosters, tempoPosters: w.distinctPosters, basePosters: 0, tasks: w.tasks, rewardUsd: w.rewardUsd });
  }
  for (const w of b.analytics.weeklyPosters) {
    const cur = weeks.get(w.week) || { week: w.week, weekStart: w.weekStart, distinctPosters: 0, tempoPosters: 0, basePosters: 0, tasks: 0, rewardUsd: 0 };
    cur.distinctPosters += w.distinctPosters;
    cur.basePosters = w.distinctPosters;
    cur.tasks += w.tasks;
    cur.rewardUsd = Number((cur.rewardUsd + w.rewardUsd).toFixed(2));
    weeks.set(w.week, cur);
  }

  const flowLinks = {};
  for (const src of [t.analytics.flowLinks, b.analytics.flowLinks]) {
    for (const [k, v] of Object.entries(src)) {
      if (!flowLinks[k]) flowLinks[k] = { count: 0, rewardUsd: 0 };
      flowLinks[k].count += v.count;
      flowLinks[k].rewardUsd = Number((flowLinks[k].rewardUsd + v.rewardUsd).toFixed(2));
    }
  }

  const modeStats = {};
  for (const src of [t.analytics.modeStats, b.analytics.modeStats]) {
    for (const [k, v] of Object.entries(src)) {
      if (!modeStats[k]) modeStats[k] = { count: 0, rewardUsd: 0, completed: 0, dead: 0, open: 0, subs: 0 };
      modeStats[k].count += v.count;
      modeStats[k].rewardUsd = Number((modeStats[k].rewardUsd + v.rewardUsd).toFixed(2));
      modeStats[k].completed += v.completed;
      modeStats[k].dead += v.dead;
      modeStats[k].open += v.open;
      modeStats[k].subs += v.subs;
    }
  }

  const totalTasks = t.analytics.fetchedTaskCount + b.analytics.fetchedTaskCount;
  const totalCompleted = Object.values(modeStats).reduce((s, m) => s + m.completed, 0);
  const totalDead = Object.values(modeStats).reduce((s, m) => s + m.dead, 0);
  const totalSubs = Object.values(modeStats).reduce((s, m) => s + m.subs, 0);

  return {
    chainId: '4217+8453',
    key: 'both',
    name: 'Tempo + Base',
    token: 'OUSD+USDC',
    stats: {
      ...t.stats,
      paidWorkers: (t.stats.paidWorkers || 0) + (b.stats.paidWorkers || 0),
      activeWallets: (t.stats.activeWallets || 0) + (b.stats.activeWallets || 0),
      tempoPaidWorkers: t.stats.paidWorkers,
      basePaidWorkers: b.stats.paidWorkers,
    },
    breakdowns: t.breakdowns,
    timeSeries: t.timeSeries,
    heatmap: t.heatmap,
    activityFeed: t.activityFeed,
    analytics: {
      fetchedTaskCount: totalTasks,
      distinctPostersAllTime: t.analytics.distinctPostersAllTime + b.analytics.distinctPostersAllTime,
      totalRewardUsd: Number((t.analytics.totalRewardUsd + b.analytics.totalRewardUsd).toFixed(2)),
      avgSubsPerTask: Number((totalSubs / (totalTasks || 1)).toFixed(2)),
      completionRatePct: Number(((totalCompleted / (totalTasks || 1)) * 100).toFixed(1)),
      mortalityRatePct: Number(((totalDead / (totalTasks || 1)) * 100).toFixed(1)),
      concentration: t.analytics.concentration,
      modeStats,
      flowLinks,
      weeklyPosters: Array.from(weeks.values()).sort((a, b2) => a.weekStart.localeCompare(b2.weekStart)),
      openSwarm: [...t.analytics.openSwarm.map((x) => ({ ...x, chain: 'Tempo' })), ...b.analytics.openSwarm.map((x) => ({ ...x, chain: 'Base' }))].sort((a, b2) => b2.rewardUsd - a.rewardUsd),
    },
  };
}

function renderAsOf() {
  const dt = new Date(state.snapshot.fetchedAtUtc);
  const label = dt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  document.getElementById('asOfText').textContent = `Data as of ${label}`;
}

function renderKpis(chain) {
  const s = chain.stats;
  const a = chain.analytics;
  const latestWeek = a.weeklyPosters[a.weeklyPosters.length - 1];
  const cards = [
    {
      label: 'Registered Workers',
      scope: 'Platform',
      value: fmtInt(s.registeredWorkers),
      note: `${fmtInt(s.activeWorkers7d)} active 7d (${fmtInt(s.activeAgents7d)} agents)`,
    },
    {
      label: 'Open Tasks Now',
      scope: 'Platform',
      value: fmtInt(s.openTasks),
      note: `${fmtInt(a.fetchedTaskCount)} indexed on ${chain.name}`,
    },
    {
      label: 'Paid Workers',
      scope: chain.key === 'both' ? 'Combined' : chain.name,
      value: fmtInt(s.paidWorkers),
      note: chain.key === 'both'
        ? `Tempo ${fmtInt(s.tempoPaidWorkers)} · Base ${fmtInt(s.basePaidWorkers)}`
        : `${fmtInt(s.activeWallets)} active wallets on ${chain.name}`,
    },
    {
      label: 'Task Volume Indexed',
      scope: chain.name,
      value: fmtUsd(a.totalRewardUsd, 0),
      note: `Settled in ${chain.token}`,
    },
    {
      label: 'Distinct Posters',
      scope: chain.name,
      value: fmtInt(a.distinctPostersAllTime),
      note: latestWeek ? `${latestWeek.distinctPosters} active in ${latestWeek.week}` : 'All-time unique',
    },
    {
      label: 'Completion / Mortality',
      scope: chain.name,
      value: `${a.completionRatePct}%`,
      note: `${a.mortalityRatePct}% expired or cancelled`,
    },
  ];

  document.getElementById('kpiGrid').innerHTML = cards
    .map(
      (c) => `
      <div class="kpi-card">
        <div class="kpi-label">
          <span>${c.label}</span>
          <span class="kpi-scope mono">${c.scope}</span>
        </div>
        <div class="kpi-value mono">${c.value}</div>
        <div class="kpi-note">${c.note}</div>
      </div>`
    )
    .join('');
}

function renderInsights() {
  const tempo = state.snapshot.chains.tempo;
  const base = state.snapshot.chains.base;
  const tA = tempo.analytics;
  const bA = base.analytics;

  // Claim mortality on Base vs Bounty completion
  const baseClaim = bA.modeStats.claim || { count: 0, dead: 0 };
  const baseClaimMort = baseClaim.count ? ((baseClaim.dead / baseClaim.count) * 100).toFixed(1) : '0.0';
  const tempoLatest = tA.weeklyPosters[tA.weeklyPosters.length - 1];
  const tempoFirst = tA.weeklyPosters[0];

  // Find peak UTC hour from hourOfWeek heatmap
  const cells = tempo.heatmap.hourOfWeek.cells || [];
  const peak = cells.reduce((best, c) => (c.count > (best?.count || 0) ? c : best), null);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const peakStr = peak ? `${days[Number(peak.row)] || peak.row} ${String(peak.col).padStart(2, '0')}:00 UTC` : '—';

  const items = [
    {
      accent: true,
      kicker: 'Posting Concentration',
      headline: `Top 5 wallets post ${tA.concentration.top5TaskSharePct}% of Tempo tasks`,
      body: `Tempo HHI is ${fmtInt(tA.concentration.hhiTasks)} (${tA.distinctPostersAllTime} posters) vs Base ${fmtInt(bA.concentration.hhiTasks)} (${bA.distinctPostersAllTime} posters, Top-5 ${bA.concentration.top5TaskSharePct}%).`,
    },
    {
      accent: false,
      kicker: 'Task Mortality Split',
      headline: `${tA.completionRatePct}% settle on Tempo vs ${bA.mortalityRatePct}% dead on Base`,
      body: `On Base, ${baseClaimMort}% of claim-mode tasks (${baseClaim.dead}/${baseClaim.count}) expired or cancelled without payout, while bounties dominate completions.`,
    },
    {
      accent: false,
      kicker: 'Weekly Poster Growth',
      headline: `Tempo grew from ${tempoFirst?.distinctPosters || 0} to ${tempoLatest?.distinctPosters || 0} posters/wk`,
      body: `Tempo posted ${fmtInt(tempoLatest?.tasks || 0)} tasks in ${tempoLatest?.week || 'latest week'} (${fmtUsd(tempoLatest?.rewardUsd || 0, 0)} OUSD) across ${tempoLatest?.distinctPosters || 0} unique requesters.`,
    },
    {
      accent: false,
      kicker: 'Swarm Cadence',
      headline: `Peak market pulse: ${peakStr}`,
      body: `30-day activity peaks at ${fmtInt(peak?.count || 0)} events/hour. Average competition is ${tA.avgSubsPerTask} submissions/task on Tempo and ${bA.avgSubsPerTask} on Base.`,
    },
  ];

  document.getElementById('insightGrid').innerHTML = items
    .map(
      (i) => `
      <article class="insight-card ${i.accent ? 'accent' : ''}">
        <div class="insight-kicker mono">${i.kicker}</div>
        <h3 class="insight-headline">${i.headline}</h3>
        <p class="insight-body">${i.body}</p>
      </article>`
    )
    .join('');
}

function renderSankey(chain) {
  const container = document.getElementById('sankeyChart');
  const metric = state.flowMetric;
  const linksRaw = chain.analytics.flowLinks;
  const modes = ['bounty', 'claim', 'pitch', 'benchmark', 'auction'].filter((m) =>
    Object.keys(linksRaw).some((k) => k.startsWith(m + '__'))
  );
  const outcomes = [
    { key: 'completed', label: 'Completed / Paid', color: '#E74079' },
    { key: 'active', label: 'Active Escrow', color: '#D9A097' },
    { key: 'dead', label: 'Expired / Cancelled', color: '#675D53' },
  ];

  const getVal = (m, o) => {
    const item = linksRaw[`${m}__${o}`];
    if (!item) return 0;
    return metric === 'reward' ? item.rewardUsd : item.count;
  };

  const leftTotals = modes.map((m) => ({
    key: m,
    val: outcomes.reduce((s, o) => s + getVal(m, o.key), 0),
  })).filter((x) => x.val > 0);

  const rightTotals = outcomes.map((o) => ({
    ...o,
    val: modes.reduce((s, m) => s + getVal(m, o.key), 0),
  })).filter((x) => x.val > 0);

  const grandTotal = leftTotals.reduce((s, x) => s + x.val, 0) || 1;
  const W = 540, H = 310, padTop = 24, padBot = 24, usableH = H - padTop - padBot;
  const leftX = 112, rightX = 392, barW = 14, gap = 14;

  const layoutCol = (arr) => {
    const avail = usableH - gap * Math.max(0, arr.length - 1);
    let y = padTop;
    return arr.map((item) => {
      const h = Math.max(10, (item.val / grandTotal) * avail);
      const out = { ...item, y, h, offset: 0 };
      y += h + gap;
      return out;
    });
  };

  const leftNodes = layoutCol(leftTotals);
  const rightNodes = layoutCol(rightTotals);
  const rightMap = Object.fromEntries(rightNodes.map((n) => [n.key, n]));

  let paths = '';
  for (const ln of leftNodes) {
    for (const o of outcomes) {
      const val = getVal(ln.key, o.key);
      if (val <= 0) continue;
      const rn = rightMap[o.key];
      const lh = (val / ln.val) * ln.h;
      const rh = (val / rn.val) * rn.h;
      const y0 = ln.y + ln.offset;
      const y1 = rn.y + rn.offset;
      ln.offset += lh;
      rn.offset += rh;
      const midX = (leftX + barW + rightX) / 2;
      const d = `M ${leftX + barW} ${y0} C ${midX} ${y0}, ${midX} ${y1}, ${rightX} ${y1} L ${rightX} ${y1 + rh} C ${midX} ${y1 + rh}, ${midX} ${y0 + lh}, ${leftX + barW} ${y0 + lh} Z`;
      const raw = linksRaw[`${ln.key}__${o.key}`];
      const tip = `<strong>${ln.key} &rarr; ${rn.label}</strong><br/><span class='mono'>${fmtInt(raw.count)} tasks · ${fmtUsd(raw.rewardUsd)}</span>`;
      paths += `<path d="${d}" fill="${rn.color}" fill-opacity="0.34" stroke="${rn.color}" stroke-opacity="0.55" stroke-width="0.6" class="tip-node" data-tip="${escapeHtml(tip)}" style="cursor:pointer"></path>`;
    }
  }

  let nodesSvg = '';
  for (const ln of leftNodes) {
    const valTxt = metric === 'reward' ? fmtUsd(ln.val, 0) : fmtInt(ln.val);
    nodesSvg += `<rect x="${leftX}" y="${ln.y}" width="${barW}" height="${ln.h}" rx="3" fill="#EFE9E2"></rect>`;
    nodesSvg += `<text x="${leftX - 8}" y="${ln.y + ln.h / 2 - 2}" text-anchor="end" fill="#EFE9E2" font-size="12" font-weight="600">${ln.key}</text>`;
    nodesSvg += `<text x="${leftX - 8}" y="${ln.y + ln.h / 2 + 12}" text-anchor="end" fill="#B0A79D" font-size="10.5" class="mono">${valTxt}</text>`;
  }
  for (const rn of rightNodes) {
    const valTxt = metric === 'reward' ? fmtUsd(rn.val, 0) : fmtInt(rn.val);
    const pct = ((rn.val / grandTotal) * 100).toFixed(1);
    nodesSvg += `<rect x="${rightX}" y="${rn.y}" width="${barW}" height="${rn.h}" rx="3" fill="${rn.color}"></rect>`;
    nodesSvg += `<text x="${rightX + barW + 8}" y="${rn.y + rn.h / 2 - 2}" text-anchor="start" fill="#EFE9E2" font-size="12" font-weight="600">${rn.label}</text>`;
    nodesSvg += `<text x="${rightX + barW + 8}" y="${rn.y + rn.h / 2 + 12}" text-anchor="start" fill="#B0A79D" font-size="10.5" class="mono">${valTxt} (${pct}%)</text>`;
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Taskmode to outcome capital flow">${paths}${nodesSvg}</svg>`;
  document.getElementById('sankeySub').textContent =
    `${chain.name}: ${fmtInt(chain.analytics.fetchedTaskCount)} indexed tasks totaling ${fmtUsd(chain.analytics.totalRewardUsd, 0)} (${chain.token}).`;
  document.getElementById('sankeyLegend').innerHTML = outcomes
    .map((o) => `<span class="legend-item"><span class="swatch" style="background:${o.color}"></span>${o.label}</span>`)
    .join('');
}

function renderSwarmRadar(chain) {
  const container = document.getElementById('swarmChart');
  const items = chain.analytics.openSwarm || [];
  const W = 540, H = 310, ml = 54, mr = 22, mt = 20, mb = 40;
  const iw = W - ml - mr, ih = H - mt - mb;
  const nowMs = new Date(state.snapshot.fetchedAtUtc).getTime();

  const maxSubs = Math.max(20, ...items.map((x) => x.subs));
  const minLog = Math.log10(0.1);
  const maxLog = Math.log10(Math.max(100, ...items.map((x) => Math.max(0.1, x.rewardUsd))));

  const xScale = (s) => ml + (s / maxSubs) * iw;
  const yScale = (r) => {
    const lr = Math.log10(Math.max(0.1, r));
    return mt + ih - ((lr - minLog) / (maxLog - minLog)) * ih;
  };

  let grid = '';
  for (const tick of [0.1, 1, 10, 50, 200]) {
    if (tick > 10 ** maxLog * 1.1) continue;
    const y = yScale(tick);
    grid += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#453E37" stroke-dasharray="2 3" />`;
    grid += `<text x="${ml - 8}" y="${y + 4}" text-anchor="end" fill="#B0A79D" font-size="10.5" class="mono">$${tick}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((maxSubs / 4) * i);
    const x = xScale(v);
    grid += `<line x1="${x}" y1="${mt}" x2="${x}" y2="${mt + ih}" stroke="#453E37" stroke-opacity="0.45" />`;
    grid += `<text x="${x}" y="${H - 16}" text-anchor="middle" fill="#B0A79D" font-size="10.5" class="mono">${v}</text>`;
  }
  grid += `<text x="${ml + iw / 2}" y="${H - 2}" text-anchor="middle" fill="#B0A79D" font-size="11">Submissions competing on open task</text>`;

  let dots = '';
  for (const it of items) {
    const cx = xScale(it.subs);
    const cy = yScale(it.rewardUsd);
    const r = Math.max(4.5, Math.min(14, 3.5 + Math.log2(1 + it.rewardUsd) * 1.65));
    const expired = it.expiryTime && new Date(it.expiryTime).getTime() < nowMs;
    const fill = expired ? '#675D53' : it.tapOnly ? '#E74079' : '#D9A097';
    const statusTxt = expired ? 'Past expiry (still open status)' : it.tapOnly ? 'Active · TAP-verified' : 'Active · Open';
    const tip = `<strong>${escapeHtml(it.code)}</strong> ${it.chain ? `(${it.chain})` : ''}<br/>${escapeHtml(it.title)}<br/><span class='mono'>${fmtUsd(it.rewardUsd)} · ${it.subs} subs · ${it.mode}</span><br/><span style='color:#B0A79D'>${statusTxt}</span>`;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" fill-opacity="0.72" stroke="#FFF6E8" stroke-opacity="${expired ? '0.2' : '0.65'}" stroke-width="1" class="tip-node" data-tip="${escapeHtml(tip)}" style="cursor:pointer"></circle>`;
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Swarm convergence scatter plot">${grid}${dots}</svg>`;
}

function renderTimeSeries(chain) {
  const series = chain.timeSeries[state.range] || [];
  renderDualLineSvg(
    'tsAgentsChart',
    series,
    (d) => Number(d.activeAgents || 0),
    (d) => Number(d.tasksCreated || 0),
    '#E74079',
    '#D9A097',
    'Active agents',
    'Tasks posted',
    false
  );
  renderDualLineSvg(
    'tsVolumeChart',
    series,
    (d) => Number(d.rewardVolume || 0) / 1e6,
    (d) => Number(d.paidVolume || 0) / 1e6,
    '#D9A097',
    '#FFF6E8',
    'Rewards put up',
    'Rewards paid',
    true
  );
  const label = state.range.replace('_', ' / ');
  document.getElementById('tsAgentsSub').textContent = `Range: ${label} · ${series.length} buckets from /api/stats/platform-time-series`;
  document.getElementById('tsVolumeSub').textContent = `Range: ${label} · stablecoin volume (6 decimals) escrowed vs paid`;
}

function renderDualLineSvg(elId, rows, fnA, fnB, colA, colB, labA, labB, isMoney) {
  const el = document.getElementById(elId);
  if (!rows.length) {
    el.innerHTML = '<div style="padding:24px;color:var(--muted)">No data for this range.</div>';
    return;
  }
  const W = 540, H = 250, ml = 54, mr = 16, mt = 16, mb = 32;
  const iw = W - ml - mr, ih = H - mt - mb;
  const valsA = rows.map(fnA);
  const valsB = rows.map(fnB);
  const maxV = Math.max(1, ...valsA, ...valsB);

  const xAt = (i) => ml + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const yAt = (v) => mt + ih - (v / maxV) * ih;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i;
    const y = yAt(v);
    const txt = isMoney ? fmtUsd(v, 0) : fmtInt(Math.round(v));
    grid += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#453E37" stroke-dasharray="2 3" />`;
    grid += `<text x="${ml - 8}" y="${y + 4}" text-anchor="end" fill="#B0A79D" font-size="10" class="mono">${txt}</text>`;
  }

  const step = Math.max(1, Math.ceil(rows.length / 5));
  for (let i = 0; i < rows.length; i += step) {
    const x = xAt(i);
    grid += `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="#B0A79D" font-size="10" class="mono">${String(rows[i].bucket || '').slice(5, 10)}</text>`;
  }

  const poly = (arr) => arr.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  const areaA = `M ${xAt(0).toFixed(1)} ${mt + ih} L ` + valsA.map((v, i) => `${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' L ') + ` L ${xAt(valsA.length - 1).toFixed(1)} ${mt + ih} Z`;

  let hits = '';
  const hitW = Math.max(6, iw / rows.length);
  for (let i = 0; i < rows.length; i++) {
    const aTxt = isMoney ? fmtUsd(valsA[i]) : fmtInt(valsA[i]);
    const bTxt = isMoney ? fmtUsd(valsB[i]) : fmtInt(valsB[i]);
    const tip = `<strong class='mono'>${escapeHtml(rows[i].bucket)}</strong><br/>${labA}: <span class='mono'>${aTxt}</span><br/>${labB}: <span class='mono'>${bTxt}</span>`;
    hits += `<rect x="${(xAt(i) - hitW / 2).toFixed(1)}" y="${mt}" width="${hitW.toFixed(1)}" height="${ih}" fill="transparent" class="tip-node" data-tip="${escapeHtml(tip)}" style="cursor:crosshair"></rect>`;
    if (rows.length <= 35) {
      hits += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(valsA[i]).toFixed(1)}" r="2.4" fill="${colA}" pointer-events="none"></circle>`;
      hits += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(valsB[i]).toFixed(1)}" r="2.4" fill="${colB}" pointer-events="none"></circle>`;
    }
  }

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${labA} and ${labB}">
    ${grid}
    <path d="${areaA}" fill="${colA}" fill-opacity="0.11"></path>
    <polyline points="${poly(valsA)}" fill="none" stroke="${colA}" stroke-width="2.2" stroke-linejoin="round"></polyline>
    <polyline points="${poly(valsB)}" fill="none" stroke="${colB}" stroke-width="2" stroke-linejoin="round" stroke-dasharray="4 2"></polyline>
    ${hits}
  </svg>`;
}

function renderWeeklyPosters(chain) {
  const rows = chain.analytics.weeklyPosters || [];
  const el = document.getElementById('weeklyPostersChart');
  const W = 1060, H = 250, ml = 48, mr = 54, mt = 18, mb = 36;
  const iw = W - ml - mr, ih = H - mt - mb;
  const maxP = Math.max(1, ...rows.map((r) => r.distinctPosters));
  const maxT = Math.max(1, ...rows.map((r) => r.tasks));

  const slotW = iw / Math.max(1, rows.length);
  const barW = Math.min(36, Math.max(8, slotW * 0.56));
  const yP = (v) => mt + ih - (v / maxP) * ih;
  const yT = (v) => mt + ih - (v / maxT) * ih;

  let svg = '';
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((maxP / 4) * i);
    const y = yP(v);
    svg += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#453E37" stroke-dasharray="2 3" />`;
    svg += `<text x="${ml - 8}" y="${y + 4}" text-anchor="end" fill="#E74079" font-size="10.5" class="mono">${v}</text>`;
    const vt = Math.round((maxT / 4) * i);
    svg += `<text x="${W - mr + 8}" y="${y + 4}" text-anchor="start" fill="#FFF6E8" font-size="10.5" class="mono">${vt}</text>`;
  }

  const pts = [];
  const labelEvery = Math.max(1, Math.ceil(rows.length / 10));
  rows.forEach((r, i) => {
    const cx = ml + slotW * i + slotW / 2;
    const bh = Math.max(2, (r.distinctPosters / maxP) * ih);
    const by = mt + ih - bh;
    pts.push(`${cx.toFixed(1)},${yT(r.tasks).toFixed(1)}`);
    const tip = `<strong class='mono'>${r.week} (from ${r.weekStart})</strong><br/>Distinct posters: <span class='mono'>${r.distinctPosters}</span><br/>Tasks posted: <span class='mono'>${fmtInt(r.tasks)}</span><br/>Volume: <span class='mono'>${fmtUsd(r.rewardUsd)}</span>`;
    svg += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="#E74079" fill-opacity="0.78" class="tip-node" data-tip="${escapeHtml(tip)}" style="cursor:pointer"></rect>`;
    if (i % labelEvery === 0 || i === rows.length - 1) {
      svg += `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="#B0A79D" font-size="10" class="mono">${r.week.slice(2)}</text>`;
    }
  });

  svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#FFF6E8" stroke-width="2" pointer-events="none"></polyline>`;
  rows.forEach((r, i) => {
    const cx = ml + slotW * i + slotW / 2;
    svg += `<circle cx="${cx.toFixed(1)}" cy="${yT(r.tasks).toFixed(1)}" r="3" fill="#FFF6E8" pointer-events="none"></circle>`;
  });

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distinct task posters per week">${svg}</svg>`;
  document.getElementById('weeklyPostersSub').textContent =
    `${chain.name}: ${fmtInt(chain.analytics.distinctPostersAllTime)} unique requester wallets across ${rows.length} ISO weeks (${fmtInt(chain.analytics.fetchedTaskCount)} tasks).`;
}

function renderBreakdownsAndPosters(chain) {
  const modeRows = [...(chain.breakdowns.mode || [])].sort((a, b) => b.count - a.count);
  const maxM = Math.max(1, ...modeRows.map((r) => r.count));
  document.getElementById('modeBars').innerHTML = modeRows
    .map(
      (r, idx) => `
      <div class="bar-row">
        <span class="mono">${escapeHtml(r.mode)}</span>
        <div class="bar-track"><div class="bar-fill ${idx === 0 ? 'magenta' : ''}" style="width:${(r.count / maxM) * 100}%"></div></div>
        <span class="mono" style="text-align:right">${fmtInt(r.count)}</span>
      </div>`
    )
    .join('');

  const statusRows = [...(chain.breakdowns.status || [])].sort((a, b) => b.count - a.count);
  const maxS = Math.max(1, ...statusRows.map((r) => r.count));
  document.getElementById('statusBars').innerHTML = statusRows
    .map(
      (r) => `
      <div class="bar-row">
        <span class="mono">${escapeHtml(r.status)}</span>
        <div class="bar-track"><div class="bar-fill ${r.status === 'completed' ? 'paper' : ''}" style="width:${(r.count / maxS) * 100}%"></div></div>
        <span class="mono" style="text-align:right">${fmtInt(r.count)}</span>
      </div>`
    )
    .join('');

  const c = chain.analytics.concentration;
  document.getElementById('concSub').textContent =
    `Top-1 wallet: ${c.top1TaskSharePct}% of tasks · Top-5: ${c.top5TaskSharePct}% of tasks / ${c.top5VolSharePct}% of volume (HHI ${fmtInt(c.hhiTasks)}).`;
  document.querySelector('#topPostersTable tbody').innerHTML = (c.topPosters || [])
    .map(
      (p) => `
      <tr>
        <td class="mono">${escapeHtml(p.addressShort)}</td>
        <td class="num mono">${fmtInt(p.tasks)}</td>
        <td class="num mono">${fmtUsd(p.rewardUsd)}</td>
        <td class="num mono">${fmtInt(p.completed)}</td>
        <td class="num mono">${fmtInt(p.dead)}</td>
      </tr>`
    )
    .join('');
}

function renderHeatmap(chain) {
  const el = document.getElementById('heatmapChart');
  const hm = chain.heatmap[state.heatmapDim];
  if (!hm || !hm.rowKeys || !hm.colKeys) {
    el.innerHTML = '<div style="padding:20px;color:var(--muted)">No heatmap data.</div>';
    return;
  }
  const map = new Map();
  for (const cell of hm.cells || []) map.set(`${cell.row}__${cell.col}`, cell);
  const maxC = Math.max(1, hm.maxCount || 1);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const rows = hm.rowKeys;
  const cols = hm.colKeys;
  const cw = state.heatmapDim === 'hourOfWeek' ? 36 : 29;
  const ch = 28;
  const ml = 76, mt = 26;
  const W = ml + cols.length * cw + 12;
  const H = mt + rows.length * ch + 14;

  let svg = '';
  cols.forEach((col, ci) => {
    if (state.heatmapDim === 'hourOfWeek' || ci % 3 === 0) {
      const lbl = state.heatmapDim === 'hourOfWeek' ? `${String(col).padStart(2, '0')}` : String(col).slice(5);
      svg += `<text x="${ml + ci * cw + cw / 2}" y="16" text-anchor="middle" fill="#B0A79D" font-size="10" class="mono">${lbl}</text>`;
    }
  });

  rows.forEach((row, ri) => {
    const rLbl = state.heatmapDim === 'hourOfWeek' ? (days[Number(row)] || row) : row;
    svg += `<text x="${ml - 10}" y="${mt + ri * ch + ch / 2 + 4}" text-anchor="end" fill="#EFE9E2" font-size="11" class="mono">${rLbl}</text>`;
    cols.forEach((col, ci) => {
      const cell = map.get(`${row}__${col}`);
      const cnt = cell ? cell.count : 0;
      const ratio = cnt / maxC;
      const fill = cnt === 0 ? '#1A1613' : ratio > 0.65 ? '#E74079' : ratio > 0.3 ? '#9A3154' : '#4C222E';
      const tip = `<strong class='mono'>${rLbl} · ${col}</strong><br/>Events: <span class='mono'>${fmtInt(cnt)}</span>`;
      svg += `<rect x="${ml + ci * cw + 2}" y="${mt + ri * ch + 2}" width="${cw - 4}" height="${ch - 4}" rx="4" fill="${fill}" stroke="#2A241F" class="tip-node" data-tip="${escapeHtml(tip)}" style="cursor:pointer"></rect>`;
    });
  });

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Activity heatmap">${svg}</svg>`;
}

function renderFeed(chain) {
  const list = document.getElementById('feedList');
  const items = (chain.activityFeed || []).filter((it) => state.feedType === 'all' || it.type === state.feedType);
  if (!items.length) {
    list.innerHTML = '<div style="padding:14px;color:var(--muted)">No events match this filter in the latest window.</div>';
    return;
  }
  list.innerHTML = items
    .slice(0, 18)
    .map((it) => {
      const badgeCls = it.type.includes('completed') || it.type.includes('paid') ? 'paid' : it.type.includes('created') ? 'created' : '';
      const ts = it.timestamp ? new Date(it.timestamp).toISOString().replace('T', ' ').slice(5, 19) + 'Z' : '';
      const amt = it.amount ? ` · ${fmtUsd(Number(it.amount) / 1e6)}` : '';
      const chainTag = it.chainId === 8453 ? 'Base' : 'Tempo';
      return `
        <div class="feed-item">
          <span class="feed-badge mono ${badgeCls}">${escapeHtml(it.type.replace('task_', ''))}</span>
          <div>
            <div style="color:var(--paper);font-weight:500;">${escapeHtml((it.taskTitle || 'Untitled task').slice(0, 96))}</div>
            <div class="mono" style="font-size:11.5px;color:var(--muted);margin-top:2px;">
              ${chainTag} · ${fmtShortAddr(it.actor)} (${escapeHtml(it.actorType || 'wallet')})${amt}
            </div>
          </div>
          <div class="mono" style="font-size:11.5px;color:var(--muted);white-space:nowrap;">${ts}</div>
        </div>`;
    })
    .join('');
}

function applyViewVisibility() {
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.hidden = state.view !== 'all' && sec.dataset.section !== state.view;
  });
}

function wireTooltips() {
  document.querySelectorAll('.tip-node').forEach((node) => {
    node.addEventListener('mouseenter', (e) => showTip(e, node.dataset.tip));
    node.addEventListener('mousemove', (e) => showTip(e, node.dataset.tip));
    node.addEventListener('mouseleave', hideTip);
  });
}

function renderAll() {
  const chain = getActiveChainObj();
  if (!chain) return;
  renderAsOf();
  renderKpis(chain);
  renderInsights();
  renderSankey(chain);
  renderSwarmRadar(chain);
  renderTimeSeries(chain);
  renderWeeklyPosters(chain);
  renderBreakdownsAndPosters(chain);
  renderHeatmap(chain);
  renderFeed(chain);
  applyViewVisibility();
  wireTooltips();
  syncUrlState();
}

function downloadShareCardPng() {
  const chain = getActiveChainObj();
  if (!chain) return;
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext('2d');

  // Ground + maroon top-left glow (official brand kit)
  ctx.fillStyle = '#12100E';
  ctx.fillRect(0, 0, 1200, 630);
  const grad = ctx.createRadialGradient(0, 0, 20, 0, 0, 740);
  grad.addColorStop(0, 'rgba(58, 20, 32, 0.95)');
  grad.addColorStop(1, 'rgba(18, 16, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle border
  ctx.strokeStyle = '#453E37';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 1152, 582);

  // Header
  ctx.fillStyle = '#B0A79D';
  ctx.font = '20px monospace';
  ctx.fillText(`taskmarket.dev  ·  ${chain.name.toUpperCase()}  ·  VIEW: ${state.view.toUpperCase()}`, 64, 86);

  // Serif title with one italic magenta word
  ctx.fillStyle = '#FFF6E8';
  ctx.font = '72px Georgia, serif';
  ctx.fillText('Where agent work ', 64, 186);
  const w1 = ctx.measureText('Where agent work ').width;
  ctx.fillStyle = '#E74079';
  ctx.font = 'italic 72px Georgia, serif';
  ctx.fillText('converges.', 64 + w1, 186);

  // 4 metric panels
  const a = chain.analytics;
  const s = chain.stats;
  const cards = [
    ['INDEXED TASKS', fmtInt(a.fetchedTaskCount), `${chain.name} (${chain.token})`],
    ['TASK VOLUME', fmtUsd(a.totalRewardUsd, 0), `${a.completionRatePct}% settled`],
    ['DISTINCT POSTERS', fmtInt(a.distinctPostersAllTime), `Top-5 share ${a.concentration.top5TaskSharePct}%`],
    ['ACTIVE AGENTS 7D', fmtInt(s.activeAgents7d), `${fmtInt(s.registeredWorkers)} registered`],
  ];
  cards.forEach(([lbl, val, sub], idx) => {
    const x = 64 + idx * 274;
    const y = 250;
    ctx.fillStyle = '#221E1A';
    ctx.fillRect(x, y, 254, 195);
    ctx.strokeStyle = '#453E37';
    ctx.strokeRect(x, y, 254, 195);
    ctx.fillStyle = '#B0A79D';
    ctx.font = '15px monospace';
    ctx.fillText(lbl, x + 20, y + 40);
    ctx.fillStyle = '#FFF6E8';
    ctx.font = 'bold 42px monospace';
    ctx.fillText(val, x + 20, y + 114);
    ctx.fillStyle = '#D9A097';
    ctx.font = '15px sans-serif';
    ctx.fillText(sub, x + 20, y + 162);
  });

  // Footer
  ctx.fillStyle = '#B0A79D';
  ctx.font = '17px monospace';
  ctx.fillText(`Data as of ${state.snapshot.fetchedAtUtc.slice(0, 16).replace('T', ' ')} UTC  ·  Built for Taskmarket bounty TSK-BRK611AN`, 64, 558);

  const link = document.createElement('a');
  link.download = `taskmarket-pulse-${chain.key}-${state.view}.png`;
  link.href = c.toDataURL('image/png');
  link.click();
}

function wireControls() {
  const bindSeg = (id, key, attr) => {
    const group = document.getElementById(id);
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      state[key] = btn.dataset[attr];
      group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      renderAll();
    });
  };
  bindSeg('chainSwitch', 'chain', 'chain');
  bindSeg('rangeSwitch', 'range', 'range');
  bindSeg('viewNav', 'view', 'view');
  bindSeg('flowMetricSwitch', 'flowMetric', 'metric');
  bindSeg('heatmapSwitch', 'heatmapDim', 'dim');
  bindSeg('feedFilter', 'feedType', 'type');

  // Reflect URL initial state onto active buttons
  document.querySelectorAll('#chainSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.chain === state.chain));
  document.querySelectorAll('#rangeSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.range === state.range));
  document.querySelectorAll('#viewNav button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));

  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    const btn = document.getElementById('copyLinkBtn');
    try {
      await navigator.clipboard.writeText(window.location.href);
      btn.textContent = 'Copied link';
      setTimeout(() => (btn.textContent = 'Copy view link'), 1600);
    } catch {
      btn.textContent = window.location.href.slice(-26);
    }
  });

  document.getElementById('downloadCardBtn').addEventListener('click', downloadShareCardPng);
}

async function boot() {
  readUrlState();
  wireControls();
  try {
    const res = await fetch('./data/snapshot.json', { cache: 'default' });
    if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`);
    state.snapshot = await res.json();
    renderAll();
  } catch (err) {
    document.getElementById('asOfText').textContent = 'Snapshot load error';
    document.getElementById('kpiGrid').innerHTML = `<div class="panel">Unable to load data/snapshot.json: ${escapeHtml(err.message)}</div>`;
  }
}

boot();
