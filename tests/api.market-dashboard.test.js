import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketDashboardPayload } from "../src/server/dashboardPayload.js";

test("buildMarketDashboardPayload returns the expected API contract", async () => {
  const payload = await buildMarketDashboardPayload({
    repository: async () => ({
      latestRows: [
        {
          date: "2026-07-15",
          symbol: "AAA",
          close: 100,
          volume: 500000,
          high_tb4d: 95,
          vol_tb10d: 200000,
          roc26: 14,
          ma20: 90,
          ma50: 80,
          ma50_tb5d: 1,
          roc_ts: 7
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
          roc_ts: 1
        }
      ],
      historyRows: [
        {
          date: "2026-07-15",
          symbol: "AAA",
          close: 100,
          volume: 500000,
          high_tb4d: 95,
          vol_tb10d: 200000,
          roc26: 14,
          ma20: 90,
          ma50: 80,
          ma50_tb5d: 1,
          roc_ts: 7
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
          roc_ts: 1
        }
      ],
      recentDates: ["2026-07-15", "2026-07-14", "2026-07-13"],
      benchmarkSymbol: "VNINDEX",
      snapshotView: "stock_latest_snapshot",
      tableName: "stock_indicators",
      freshnessWindowSessions: 5
    })
  });

  assert.equal(payload.source, "supabase");
  assert.equal(payload.dataDate, "2026-07-15");
  assert.deepEqual(payload.meta.rsDates, ["2026-07-15", "2026-07-14", "2026-07-13"]);
  assert.equal(payload.meta.snapshotView, "stock_latest_snapshot");
  assert.ok(Array.isArray(payload.req1Rows));
  assert.ok(Array.isArray(payload.req2Rows));
  assert.ok(Array.isArray(payload.warnings));
});
