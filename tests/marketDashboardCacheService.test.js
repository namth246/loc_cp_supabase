import test from "node:test";
import assert from "node:assert/strict";

import {
  loadMarketDashboardPayload,
  updateMarketData
} from "../src/server/marketDashboardCacheService.js";

test("loadMarketDashboardPayload returns the cached payload without rebuilding the snapshot", async () => {
  const expectedPayload = {
    source: "supabase",
    dataDate: "2026-07-16",
    warnings: [],
    req1Rows: [],
    req2Rows: [],
    meta: {
      snapshotView: "market_dashboard_cache"
    }
  };
  let snapshotRebuildCalls = 0;

  const payload = await loadMarketDashboardPayload({
    cacheReader: async () => expectedPayload,
    fallbackBuilder: async () => {
      snapshotRebuildCalls += 1;
      return null;
    }
  });

  assert.deepEqual(payload, expectedPayload);
  assert.equal(snapshotRebuildCalls, 0);
});

test("updateMarketData rebuilds the dashboard once and writes the prepared cache payload", async () => {
  const writes = [];

  const result = await updateMarketData({
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "service-role",
      SUPABASE_MARKET_DASHBOARD_CACHE_KEY: "market_dashboard"
    },
    payloadBuilder: async () => ({
      source: "supabase",
      syncedAt: "2026-07-16T10:05:00.000Z",
      dataDate: "2026-07-16",
      warnings: [],
      req1Rows: [{ symbol: "AAA" }],
      req2Rows: [],
      meta: {
        snapshotView: "stock_latest_snapshot",
        tableName: "stock_indicators"
      }
    }),
    cacheWriter: async (entry) => {
      writes.push(entry);
      return entry;
    }
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].cacheKey, "market_dashboard");
  assert.equal(writes[0].dataDate, "2026-07-16");
  assert.equal(writes[0].payload.meta.snapshotView, "stock_latest_snapshot");
  assert.deepEqual(result.payload, writes[0].payload);
});

test("loadMarketDashboardPayload converts missing cache storage into a fast 503-style error", async () => {
  await assert.rejects(
    () =>
      loadMarketDashboardPayload({
        cacheReader: async () => {
          throw new Error('Could not find the table "market_dashboard_cache" in the schema cache');
        }
      }),
    (error) => {
      assert.equal(error.code, "MARKET_DASHBOARD_CACHE_MISS");
      assert.match(error.message, /cache is unavailable/i);
      return true;
    }
  );
});
