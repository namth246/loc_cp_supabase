import test from "node:test";
import assert from "node:assert/strict";

import {
  clearMarketDashboardMemoryCache,
  readMarketDashboardCache
} from "../src/server/marketDashboardCacheRepository.js";

function createCacheClient(row) {
  const state = {
    selectedColumns: null,
    filters: [],
    orders: [],
    limitValue: null
  };

  const builder = {
    select(columns) {
      state.selectedColumns = columns;
      return builder;
    },
    eq(column, value) {
      state.filters.push({ column, value });
      return builder;
    },
    order(column, options) {
      state.orders.push({ column, options });
      return builder;
    },
    limit(value) {
      state.limitValue = value;
      return Promise.resolve({
        data: row ? [row] : [],
        error: null
      });
    }
  };

  return {
    state,
    client: {
      from(name) {
        assert.equal(name, "market_dashboard_cache");
        return builder;
      }
    }
  };
}

test("readMarketDashboardCache selects only the latest cache row from Supabase", async () => {
  clearMarketDashboardMemoryCache();
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
  const { client, state } = createCacheClient({
    cache_key: "market_dashboard",
    data_date: "2026-07-16",
    generated_at: "2026-07-16T10:00:00.000Z",
    payload: expectedPayload
  });

  const payload = await readMarketDashboardCache({
    client,
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "service-role",
      SUPABASE_MARKET_DASHBOARD_CACHE_TABLE: "market_dashboard_cache",
      SUPABASE_MARKET_DASHBOARD_CACHE_KEY: "market_dashboard"
    }
  });

  assert.deepEqual(payload, expectedPayload);
  assert.equal(state.selectedColumns, "cache_key,data_date,generated_at,payload");
  assert.deepEqual(state.filters, [{ column: "cache_key", value: "market_dashboard" }]);
  assert.deepEqual(state.orders, [{ column: "generated_at", options: { ascending: false } }]);
  assert.equal(state.limitValue, 1);
});

test("readMarketDashboardCache reuses the in-memory payload before hitting Supabase again", async () => {
  clearMarketDashboardMemoryCache();
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
  const firstClient = createCacheClient({
    cache_key: "market_dashboard",
    data_date: "2026-07-16",
    generated_at: "2026-07-16T10:00:00.000Z",
    payload: expectedPayload
  });

  const firstPayload = await readMarketDashboardCache({
    client: firstClient.client,
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "service-role",
      SUPABASE_MARKET_DASHBOARD_CACHE_TABLE: "market_dashboard_cache",
      SUPABASE_MARKET_DASHBOARD_CACHE_KEY: "market_dashboard",
      MARKET_DASHBOARD_MEMORY_CACHE_TTL_MS: "60000"
    }
  });

  assert.deepEqual(firstPayload, expectedPayload);

  const secondPayload = await readMarketDashboardCache({
    client: {
      from() {
        throw new Error("Supabase should not be queried when the memory cache is still fresh");
      }
    },
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "service-role",
      SUPABASE_MARKET_DASHBOARD_CACHE_TABLE: "market_dashboard_cache",
      SUPABASE_MARKET_DASHBOARD_CACHE_KEY: "market_dashboard",
      MARKET_DASHBOARD_MEMORY_CACHE_TTL_MS: "60000"
    }
  });

  assert.deepEqual(secondPayload, expectedPayload);
});
