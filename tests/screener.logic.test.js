import test from "node:test";
import assert from "node:assert/strict";

import { buildSnapshotWithRs } from "../src/server/rsCalculator.js";
import { buildBenchmarkMap, buildScreeningResult } from "../src/server/screenerService.js";

test("buildSnapshotWithRs assigns percentile ranks from the latest available history", () => {
  const latestRows = [
    { date: "2026-07-15", symbol: "AAA", roc_ts: 8, roc26: 18 },
    { date: "2026-07-15", symbol: "BBB", roc_ts: 4, roc26: 12 },
    { date: "2026-07-15", symbol: "VNINDEX", roc_ts: 2, roc26: 10 }
  ];
  const historyRows = [
    { date: "2026-07-15", symbol: "AAA", roc_ts: 8, roc26: 18 },
    { date: "2026-07-15", symbol: "BBB", roc_ts: 4, roc26: 12 },
    { date: "2026-07-15", symbol: "VNINDEX", roc_ts: 2, roc26: 10 },
    { date: "2026-07-14", symbol: "AAA", roc_ts: 7, roc26: 17 },
    { date: "2026-07-14", symbol: "BBB", roc_ts: 3, roc26: 11 }
  ];

  const snapshotRows = buildSnapshotWithRs(latestRows, historyRows, {
    freshnessDates: ["2026-07-15", "2026-07-14"]
  });
  const aaa = snapshotRows.find((row) => row.symbol === "AAA");
  const bbb = snapshotRows.find((row) => row.symbol === "BBB");
  const benchmark = snapshotRows.find((row) => row.symbol === "VNINDEX");

  assert.equal(aaa.rs1, 100);
  assert.equal(bbb.rs1, 0);
  assert.equal(aaa.isFresh, true);
  assert.equal(benchmark.rs1, null);
});

test("buildScreeningResult returns req1/req2 rows and excludes stale symbols", () => {
  const snapshotRows = [
    {
      date: "2026-07-15",
      symbol: "AAA",
      close: 120,
      volume: 500000,
      high_tb4d: 100,
      vol_tb10d: 200000,
      roc26: 18,
      ma20: 130,
      ma50: 140,
      ma50_tb5d: 1,
      rs1: 95,
      rs2: 92,
      rs3: 90,
      rs_avg: 92.33,
      isFresh: true
    },
    {
      date: "2026-07-15",
      symbol: "BBB",
      close: 90,
      volume: 600000,
      high_tb4d: 80,
      vol_tb10d: 200000,
      roc26: 12,
      ma20: 85,
      ma50: 70,
      ma50_tb5d: 0.5,
      rs1: 80,
      rs2: 78,
      rs3: 82,
      rs_avg: 80,
      isFresh: true
    },
    {
      date: "2026-07-15",
      symbol: "CCC",
      close: 50,
      volume: 700000,
      high_tb4d: 60,
      vol_tb10d: 300000,
      roc26: 11,
      ma20: 55,
      ma50: 60,
      ma50_tb5d: -1,
      rs1: 70,
      rs2: 71,
      rs3: 69,
      rs_avg: 70,
      isFresh: true
    },
    {
      date: "2026-07-10",
      symbol: "DDD",
      close: 80,
      volume: 800000,
      high_tb4d: 70,
      vol_tb10d: 200000,
      roc26: 30,
      ma20: 70,
      ma50: 60,
      ma50_tb5d: 1,
      rs1: 88,
      rs2: 87,
      rs3: 86,
      rs_avg: 87,
      isFresh: false
    },
    {
      date: "2026-07-15",
      symbol: "VNINDEX",
      close: 1500,
      volume: 0,
      high_tb4d: 0,
      vol_tb10d: 0,
      roc26: 10,
      ma20: 0,
      ma50: 0,
      ma50_tb5d: 0,
      rs1: null,
      rs2: null,
      rs3: null,
      rs_avg: null,
      isFresh: true
    }
  ];
  const historyRows = [{ date: "2026-07-15", symbol: "VNINDEX", roc26: 10 }];

  const result = buildScreeningResult(snapshotRows, {
    benchmarkByDate: buildBenchmarkMap(historyRows),
    benchmarkSymbol: "VNINDEX",
    freshnessDates: ["2026-07-15", "2026-07-14", "2026-07-13", "2026-07-12", "2026-07-11"],
    dataDate: "2026-07-15"
  });

  assert.equal(result.req1Rows.length, 3);
  assert.equal(result.req1Rows[0].symbol, "AAA");
  assert.equal(result.req2Rows.length, 1);
  assert.equal(result.req2Rows[0].symbol, "BBB");
  assert.equal(result.req2Rows[0].sScore, 6);
  assert.equal(result.req2Rows[0].isBuyActivated, true);
  assert.equal(result.meta.staleUniverseSize, 1);
  assert.equal(result.meta.benchmarkAvailable, true);
  assert.ok(result.warnings.some((warning) => warning.code === "STALE_SYMBOLS_EXCLUDED"));
});
