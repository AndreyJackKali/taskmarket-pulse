#!/usr/bin/env node
/**
 * Integrity & compliance verifier for Taskmarket Pulse (v1.2.0).
 * Validates snapshot schema, both chains (Tempo 4217 & Base 8453), OG share cards,
 * flow conservation, and brand-kit / bounty rules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "data", "snapshot.json"), "utf8"));

function assert(cond, msg) {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
}

assert(Boolean(SNAP.dataAsOf), "Missing dataAsOf timestamp");
const ageMin = (Date.now() - new Date(SNAP.dataAsOf).getTime()) / 60000;
assert(ageMin < 120, `Snapshot too stale: ${ageMin.toFixed(1)} min`);

for (const key of ["tempo", "base"]) {
  const c = SNAP.chains?.[key];
  assert(Boolean(c), `Missing chain ${key}`);
  assert(typeof c.headline?.openTasks === "number", `${key}: missing headline.openTasks`);
  assert(typeof c.headline?.paidWorkers === "number", `${key}: missing headline.paidWorkers`);
  assert(Array.isArray(c.breakdowns?.status) && c.breakdowns.status.length > 0, `${key}: missing status breakdown`);
  assert(Array.isArray(c.breakdowns?.mode) && c.breakdowns.mode.length > 0, `${key}: missing mode breakdown`);
  assert(Array.isArray(c.timeSeries?.["30d_day"]) && c.timeSeries["30d_day"].length > 0, `${key}: missing 30d_day timeSeries`);
  assert(Array.isArray(c.heatmaps?.hourOfWeek?.cells) && c.heatmaps.hourOfWeek.cells.length > 0, `${key}: missing hourOfWeek heatmap`);
  assert(Array.isArray(c.activityFeed) && c.activityFeed.length > 0, `${key}: missing activityFeed`);
  assert(Array.isArray(c.analytics?.distinctPostersByWeek) && c.analytics.distinctPostersByWeek.length > 0, `${key}: missing distinctPostersByWeek`);
  assert(Array.isArray(c.analytics?.topWinners) && c.analytics.topWinners.length > 0, `${key}: missing topWinners`);
  assert(Array.isArray(c.analytics?.mortalityByTier) && c.analytics.mortalityByTier.length === 4, `${key}: missing 4 mortalityByTier buckets`);
  assert(Array.isArray(c.analytics?.flow?.modeToWinner) && c.analytics.flow.modeToWinner.length > 0, `${key}: missing flow.modeToWinner`);
  assert(c.analytics?.decisionTiming && typeof c.analytics.decisionTiming.completedWindowMedianH === "number", `${key}: missing decisionTiming`);
  assert(c.growth7d && typeof c.growth7d.tasksCur === "number", `${key}: missing growth7d`);
  assert(c.analytics.indexedTasksCount > 0, `${key}: zero indexed tasks`);

  // Verify exact flow conservation across all three Sankey layers
  const sumC2M = c.analytics.flow.cohortToMode.reduce((s, e) => s + e.tasks, 0);
  const sumM2S = c.analytics.flow.modeToStatus.reduce((s, e) => s + e.tasks, 0);
  const sumM2W = c.analytics.flow.modeToWinner.reduce((s, e) => s + e.tasks, 0);
  const sumTier = c.analytics.mortalityByTier.reduce((s, t) => s + t.total, 0);
  assert(sumC2M === c.analytics.indexedTasksCount, `${key}: cohortToMode task conservation mismatch (${sumC2M} != ${c.analytics.indexedTasksCount})`);
  assert(sumM2S === c.analytics.indexedTasksCount, `${key}: modeToStatus task conservation mismatch (${sumM2S} != ${c.analytics.indexedTasksCount})`);
  assert(sumM2W === c.analytics.indexedTasksCount, `${key}: modeToWinner task conservation mismatch (${sumM2W} != ${c.analytics.indexedTasksCount})`);
  assert(sumTier === c.analytics.indexedTasksCount, `${key}: mortalityByTier sum mismatch (${sumTier} != ${c.analytics.indexedTasksCount})`);
}

// Verify frontend files against bounty pass/fail rules
const html = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "docs", "app.js"), "utf8");
const combined = (html + "\n" + js).toLowerCase();

assert(!js.includes('fetch("https://api.taskmarket.dev') && !js.includes("fetch('https://api.taskmarket.dev"), "Client JS must NOT call api.taskmarket.dev directly");
assert(!combined.includes("window.ethereum"), "Must be read-only with no wallet connection");
assert(html.includes("not an official Taskmarket product"), "Footer must state not an official Taskmarket product");
assert(html.includes("og-overview.png"), "Missing Open Graph share image meta tag");

const bannedWords = ["revolutionary", "game-changing", "passive income", "get rich", "to the moon", "10x"];
for (const bw of bannedWords) {
  assert(!combined.includes(bw), `Banned brand-kit phrase found: ${bw}`);
}

console.log(
  `[PASS] Verified v${SNAP.schemaVersion} snapshot as of ${SNAP.dataAsOf} | Tempo tasks=${SNAP.chains.tempo.analytics.indexedTasksCount} (posters=${SNAP.chains.tempo.analytics.distinctPostersTotal}, winners=${SNAP.chains.tempo.analytics.distinctWinnersTotal}) | Base tasks=${SNAP.chains.base.analytics.indexedTasksCount} (posters=${SNAP.chains.base.analytics.distinctPostersTotal}, winners=${SNAP.chains.base.analytics.distinctWinnersTotal})`
);
