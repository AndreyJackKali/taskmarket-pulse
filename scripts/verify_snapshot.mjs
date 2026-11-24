#!/usr/bin/env node
/**
 * Integrity & compliance verifier for Taskmarket Pulse.
 * Validates snapshot schema, both chains (Tempo 4217 & Base 8453), and brand-kit / bounty rules.
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
  assert(c.analytics.indexedTasksCount > 0, `${key}: zero indexed tasks`);
}

// Check frontend files for banned brand words, client-side api.taskmarket.dev calls, or wallet connect
const html = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "docs", "app.js"), "utf8");
const combined = (html + "\n" + js).toLowerCase();

assert(!js.includes("fetch(\"https://api.taskmarket.dev") && !js.includes("fetch('https://api.taskmarket.dev"), "Client JS must NOT call api.taskmarket.dev directly");
assert(!combined.includes("window.ethereum"), "Must be read-only with no wallet connection");
assert(html.includes("not an official Taskmarket product"), "Footer must state not an official Taskmarket product");
assert(html.includes("og-overview.png"), "Missing Open Graph share image meta tag");

const bannedWords = ["revolutionary", "game-changing", "passive income", "get rich", "to the moon", "10x"];
for (const bw of bannedWords) {
  assert(!combined.includes(bw), `Banned brand-kit phrase found: ${bw}`);
}

console.log(
  `[PASS] Verified snapshot as of ${SNAP.dataAsOf} | Tempo tasks=${SNAP.chains.tempo.analytics.indexedTasksCount} (posters=${SNAP.chains.tempo.analytics.distinctPostersTotal}) | Base tasks=${SNAP.chains.base.analytics.indexedTasksCount} (posters=${SNAP.chains.base.analytics.distinctPostersTotal})`
);
