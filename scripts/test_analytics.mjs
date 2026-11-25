#!/usr/bin/env node
/**
 * Zero-dependency unit & compliance test suite for Taskmarket Pulse (v1.2.0).
 * Runs with `node --test scripts/test_analytics.mjs` or `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeTaskAnalytics,
  computeGrowthMetrics,
  isoWeekKey,
  percentile,
  rewardTierLabel,
  shortAddr,
  toUsd,
} from "./fetch_snapshot.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("shortAddr formats Ethereum addresses without guessing identities", () => {
  assert.equal(shortAddr("0x9dc4E39fe0BC2C13d08Cc67ccA4eb104A2f54d53"), "0x9dc4…4d53");
  assert.equal(shortAddr(""), "unknown");
});

test("toUsd converts 6-decimal OUSD/USDC base units accurately", () => {
  assert.equal(toUsd("6000000"), 6);
  assert.equal(toUsd("250000"), 0.25);
  assert.equal(toUsd(null), 0);
});

test("isoWeekKey anchors Monday UTC week start deterministically", () => {
  const wk = isoWeekKey("2026-11-25T02:00:00Z"); // Wednesday
  assert.equal(wk.weekStart, "2026-11-23");
  assert.equal(wk.isoWeek, "2026-W48");
});

test("percentile computes p25, median, and p75 cleanly", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
  assert.equal(percentile([10, 20, 30, 40], 0.25), 17.5);
  assert.equal(percentile([], 0.5), 0);
});

test("rewardTierLabel partitions all reward bands without gaps", () => {
  assert.equal(rewardTierLabel(0.1), "<$0.50");
  assert.equal(rewardTierLabel(0.5), "$0.50–$2");
  assert.equal(rewardTierLabel(2.0), "$2–$10");
  assert.equal(rewardTierLabel(10.0), "$10+");
});

test("computeTaskAnalytics conserves flow counts, computes winners, mortality tiers, and decision timing", () => {
  const sampleTasks = [
    {
      id: "0x01",
      requester: "0x1111111111111111111111111111111111111111",
      reward: "10000000", // $10
      mode: "bounty",
      status: "completed",
      createdAt: "2026-11-20T00:00:00Z",
      expiryTime: "2026-11-21T00:00:00Z", // 24h
      primaryAward: { workerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    },
    {
      id: "0x02",
      requester: "0x1111111111111111111111111111111111111111",
      reward: "5000000", // $5
      mode: "claim",
      status: "completed",
      createdAt: "2026-11-20T02:00:00Z",
      claimedAt: "2026-11-20T04:00:00Z", // 2h to claim
      expiryTime: "2026-11-22T02:00:00Z", // 48h
      primaryAward: { workerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    },
    {
      id: "0x03",
      requester: "0x2222222222222222222222222222222222222222",
      reward: "250000", // $0.25
      mode: "bounty",
      status: "expired",
      createdAt: "2026-11-21T00:00:00Z",
      expiryTime: "2026-11-24T00:00:00Z", // 72h
    },
    {
      id: "0x04",
      requester: "0x3333333333333333333333333333333333333333",
      reward: "1500000", // $1.50
      mode: "bounty",
      status: "open",
      referenceCode: "TSK-TEST",
      description: "Sample open task",
      submissionCount: 15,
      createdAt: "2026-11-24T00:00:00Z",
      expiryTime: "2026-11-26T00:00:00Z",
    },
  ];
  const sampleFeed = [
    { type: "task_completed", taskId: "0x01", timestamp: "2026-11-20T06:00:00Z" }, // 6h observed
  ];

  const a = computeTaskAnalytics(sampleTasks, sampleFeed, "2026-11-25T00:00:00Z");
  assert.equal(a.indexedTasksCount, 4);
  assert.equal(a.distinctPostersTotal, 3);
  assert.equal(a.distinctWinnersTotal, 1);
  assert.equal(a.repeatWinners, 1);
  assert.equal(a.top5WinnerSharePct, 100);
  assert.equal(a.completionRatePct, 50);
  assert.equal(a.mortalityRatePct, 25);
  assert.equal(a.decisionTiming.completedWindowMedianH, 36);
  assert.equal(a.decisionTiming.deadWindowMedianH, 72);
  assert.equal(a.decisionTiming.observedDecisionMedianH, 6);
  assert.equal(a.decisionTiming.observedDecisionSamples, 1);
  assert.equal(a.decisionTiming.medianClaimMinutes, 120);
  assert.equal(a.swarmConvergence.length, 1);
  assert.equal(a.swarmConvergence[0].rewardPerSubUsd, 0.1);
  assert.equal(a.swarmConvergence[0].hoursLeft, 24);

  // Conservation across all flow layers and mortality tiers
  assert.equal(a.flow.cohortToMode.reduce((s, e) => s + e.tasks, 0), 4);
  assert.equal(a.flow.modeToStatus.reduce((s, e) => s + e.tasks, 0), 4);
  assert.equal(a.flow.modeToWinner.reduce((s, e) => s + e.tasks, 0), 4);
  assert.equal(a.mortalityByTier.reduce((s, t) => s + t.total, 0), 4);
});

test("computeGrowthMetrics excludes today's partial bucket and computes exact WoW deltas", () => {
  const rows = [];
  for (let i = 0; i < 15; i++) {
    const day = String(i + 1).padStart(2, "0");
    const isPrev = i < 7;
    const isCur = i >= 7 && i < 14;
    rows.push({
      bucket: `2026-11-${day}`,
      tasksCreated: isPrev ? 10 : isCur ? 15 : 1, // partial day 15 has 1 task (excluded)
      paidVolume: isPrev ? "10000000" : isCur ? "20000000" : "1000000",
      rewardVolume: isPrev ? "20000000" : isCur ? "30000000" : "1000000",
      activeAgents: isPrev ? 40 : isCur ? 60 : 5,
    });
  }
  const g = computeGrowthMetrics(rows);
  assert.equal(g.tasksPrev, 70);
  assert.equal(g.tasksCur, 105);
  assert.equal(g.tasksDeltaPct, 50);
  assert.equal(g.paidDeltaPct, 100);
  assert.equal(g.escrowedDeltaPct, 50);
  assert.equal(g.agentsDeltaPct, 50);
});

test("all 5 server-generated OG share cards exist and are non-empty PNGs", () => {
  for (const card of ["og-overview.png", "og-flow.png", "og-posters.png", "og-heatmap.png", "og-timeseries.png"]) {
    const p = path.join(ROOT, "docs", card);
    assert.ok(fs.existsSync(p), `Missing ${card}`);
    const buf = fs.readFileSync(p);
    assert.ok(buf.length > 5000, `${card} unexpectedly small`);
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50); // PNG magic
  }
});

test("bundle stays lightweight (<150 KB HTML+CSS+JS) for sub-3s mobile load", () => {
  const totalBytes = ["index.html", "styles.css", "app.js"].reduce(
    (s, f) => s + fs.statSync(path.join(ROOT, "docs", f)).size,
    0
  );
  assert.ok(totalBytes < 150000, `Frontend bundle too large: ${totalBytes} bytes`);
});
