#!/usr/bin/env node
/**
 * Generates Brand-Kit-compliant SVG share cards per view from data/snapshot.json.
 * MIT License — built for Taskmarket bounty TSK-BRK611AN.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fmtInt(n) { return Number(n || 0).toLocaleString('en-US'); }
function fmtUsd(n) { return '$' + Math.round(Number(n || 0)).toLocaleString('en-US'); }

function buildCardSvg({ subtitle, accentWord, headlinePrefix, cards, asOf }) {
  const cardBlocks = cards.map((c, i) => {
    const x = 64 + i * 274;
    return `
      <rect x="${x}" y="252" width="254" height="196" rx="10" fill="#221E1A" stroke="#453E37" stroke-width="1.5"/>
      <text x="${x + 20}" y="290" fill="#B0A79D" font-family="monospace" font-size="14" letter-spacing="1">${c.label}</text>
      <text x="${x + 20}" y="362" fill="#FFF6E8" font-family="monospace" font-size="40" font-weight="700">${c.value}</text>
      <text x="${x + 20}" y="416" fill="#D9A097" font-family="sans-serif" font-size="15">${c.note}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="maroonGlow" cx="0%" cy="0%" r="75%">
      <stop offset="0%" stop-color="#3A1420" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#12100E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#12100E"/>
  <rect width="1200" height="630" fill="url(#maroonGlow)"/>
  <rect x="24" y="24" width="1152" height="582" rx="14" fill="none" stroke="#453E37" stroke-width="1.5"/>
  <text x="64" y="84" fill="#B0A79D" font-family="monospace" font-size="18">taskmarket.dev  ·  ${subtitle}</text>
  <text x="64" y="182" fill="#FFF6E8" font-family="Georgia, serif" font-size="68">${headlinePrefix} <tspan fill="#E74079" font-style="italic">${accentWord}</tspan></text>
  ${cardBlocks}
  <text x="64" y="556" fill="#B0A79D" font-family="monospace" font-size="16">Data as of ${asOf}  ·  Server-fetched hourly  ·  Built for bounty TSK-BRK611AN</text>
</svg>`;
}

async function main() {
  const snap = JSON.parse(await fs.readFile(path.join(ROOT, 'data/snapshot.json'), 'utf8'));
  const t = snap.chains.tempo;
  const b = snap.chains.base;
  const asOf = snap.fetchedAtUtc.slice(0, 16).replace('T', ' ') + ' UTC';
  const assetsDir = path.join(ROOT, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const views = [
    {
      file: 'share-overview.svg',
      subtitle: 'LIVE MARKET PULSE · TEMPO & BASE',
      headlinePrefix: 'Where agent work',
      accentWord: 'converges.',
      cards: [
        { label: 'ACTIVE AGENTS 7D', value: fmtInt(t.stats.activeAgents7d), note: `${fmtInt(t.stats.registeredWorkers)} registered` },
        { label: 'TEMPO TASKS', value: fmtInt(t.analytics.fetchedTaskCount), note: `${fmtUsd(t.analytics.totalRewardUsd)} OUSD · ${t.analytics.completionRatePct}% done` },
        { label: 'BASE TASKS', value: fmtInt(b.analytics.fetchedTaskCount), note: `${fmtUsd(b.analytics.totalRewardUsd)} USDC · ${b.analytics.distinctPostersAllTime} posters` },
        { label: 'OPEN NOW', value: fmtInt(t.stats.openTasks), note: 'Read-only · Hourly refresh' },
      ],
    },
    {
      file: 'share-flow.svg',
      subtitle: 'CAPITAL & OUTCOME FLOW',
      headlinePrefix: 'How escrow',
      accentWord: 'settles.',
      cards: [
        { label: 'TEMPO SETTLEMENT', value: `${t.analytics.completionRatePct}%`, note: `${t.analytics.mortalityRatePct}% expired/cancelled` },
        { label: 'BASE SETTLEMENT', value: `${b.analytics.completionRatePct}%`, note: `${b.analytics.mortalityRatePct}% expired/cancelled` },
        { label: 'TEMPO TOP-5 SHARE', value: `${t.analytics.concentration.top5TaskSharePct}%`, note: `HHI ${fmtInt(t.analytics.concentration.hhiTasks)}` },
        { label: 'BASE TOP-5 SHARE', value: `${b.analytics.concentration.top5TaskSharePct}%`, note: `HHI ${fmtInt(b.analytics.concentration.hhiTasks)}` },
      ],
    },
    {
      file: 'share-posters.svg',
      subtitle: 'WEEKLY DISTINCT POSTERS',
      headlinePrefix: 'Who posts',
      accentWord: 'the work.',
      cards: [
        { label: 'TEMPO POSTERS', value: fmtInt(t.analytics.distinctPostersAllTime), note: `${t.analytics.weeklyPosters.at(-1)?.distinctPosters || 0} this week` },
        { label: 'BASE POSTERS', value: fmtInt(b.analytics.distinctPostersAllTime), note: `${b.analytics.weeklyPosters.at(-1)?.distinctPosters || 0} this week` },
        { label: 'TEMPO AVG SUBS', value: String(t.analytics.avgSubsPerTask), note: 'Submissions per task' },
        { label: 'BASE AVG SUBS', value: String(b.analytics.avgSubsPerTask), note: 'Submissions per task' },
      ],
    },
  ];

  for (const v of views) {
    const svg = buildCardSvg({ ...v, asOf });
    await fs.writeFile(path.join(assetsDir, v.file), svg, 'utf8');
  }
  console.log(`Generated ${views.length} SVG share cards in ${assetsDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
