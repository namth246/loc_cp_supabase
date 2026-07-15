import test from "node:test";
import assert from "node:assert/strict";

import { fetchMarketSnapshot } from "../src/server/snapshotRepository.js";

function createQueryBuilder(responseFactory) {
  const state = {
    orderCalls: [],
    limitValue: null,
    inFilter: null,
    rangeStart: null,
    rangeEnd: null
  };

  const builder = {
    select(columns) {
      state.columns = columns;
      return builder;
    },
    order(column, options) {
      state.orderCalls.push({ column, options });
      return builder;
    },
    limit(value) {
      state.limitValue = value;
      return Promise.resolve(responseFactory(state));
    },
    range(start, end) {
      state.rangeStart = start;
      state.rangeEnd = end;
      return Promise.resolve(responseFactory(state));
    },
    in(column, values) {
      state.inFilter = { column, values };
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve(responseFactory(state)).then(resolve, reject);
    }
  };

  return builder;
}

function createClient() {
  return {
    from(name) {
      if (name === "stock_indicators") {
        return createQueryBuilder((state) => {
          if (state.columns === "date") {
            return {
              data: [{ date: "2026-07-15" }, { date: "2026-07-14" }],
              error: null
            };
          }

          if (state.inFilter) {
            return {
              data: [
                {
                  date: "2026-07-15",
                  symbol: "AAA",
                  close: 10,
                  volume: 500000,
                  high_tb4d: 9,
                  vol_tb10d: 200000,
                  roc26: 11,
                  ma20: 8,
                  ma50: 7,
                  ma50_tb5d: 1,
                  roc_ts: 5
                }
              ],
              error: null
            };
          }

          return {
            data: [
              {
                date: "2026-07-15",
                symbol: "AAA",
                close: 10,
                volume: 500000,
                high_tb4d: 9,
                vol_tb10d: 200000,
                roc26: 11,
                ma20: 8,
                ma50: 7,
                ma50_tb5d: 1,
                roc_ts: 5
              },
              {
                date: "2026-07-15",
                symbol: "AAA",
                close: 9.8,
                volume: 400000,
                high_tb4d: 8.8,
                vol_tb10d: 180000,
                roc26: 10,
                ma20: 7.9,
                ma50: 6.9,
                ma50_tb5d: 1,
                roc_ts: 4
              }
            ],
            error: null
          };
        });
      }

      if (name === "stock_latest_snapshot") {
        return createQueryBuilder(() => ({
          data: null,
          error: { message: "canceling statement due to statement timeout" }
        }));
      }

      throw new Error(`Unexpected table: ${name}`);
    }
  };
}

test("fetchMarketSnapshot falls back to stock_indicators when snapshot view times out", async () => {
  const snapshot = await fetchMarketSnapshot({
    client: createClient(),
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "test-service-role",
      SUPABASE_STOCK_TABLE: "stock_indicators",
      SUPABASE_STOCK_SNAPSHOT_VIEW: "stock_latest_snapshot",
      SUPABASE_BENCHMARK_SYMBOL: "VNINDEX",
      SUPABASE_RECENT_DATE_COUNT: "2",
      SUPABASE_FRESHNESS_WINDOW: "2"
    }
  });

  assert.equal(snapshot.snapshotView, "stock_indicators:fallback");
  assert.deepEqual(snapshot.recentDates, ["2026-07-15", "2026-07-14"]);
  assert.equal(snapshot.latestRows.length, 1);
  assert.equal(snapshot.latestRows[0].symbol, "AAA");
});

function buildRows(start, count, datePrefix = "2026-07-15", symbolPrefix = "SYM") {
  return Array.from({ length: count }, (_, index) => {
    const id = start + index;
    return {
      date: datePrefix,
      symbol: `${symbolPrefix}${String(id).padStart(4, "0")}`,
      close: 10 + id,
      volume: 500000,
      high_tb4d: 9,
      vol_tb10d: 200000,
      roc26: 11,
      ma20: 8,
      ma50: 7,
      ma50_tb5d: 1,
      roc_ts: 5
    };
  });
}

function createPaginatedClient() {
  const latestPageOne = buildRows(0, 1000, "2026-07-15", "AAA");
  const latestPageTwo = [
    {
      date: "2026-07-14",
      symbol: "ZZZ_LAST",
      close: 99,
      volume: 500000,
      high_tb4d: 9,
      vol_tb10d: 200000,
      roc26: 11,
      ma20: 8,
      ma50: 7,
      ma50_tb5d: 1,
      roc_ts: 5
    }
  ];

  const historyPageOne = buildRows(0, 1000, "2026-07-15", "HIS");
  const historyPageTwo = [
    {
      date: "2026-07-14",
      symbol: "HIS_LAST",
      close: 88,
      volume: 400000,
      high_tb4d: 8,
      vol_tb10d: 180000,
      roc26: 10,
      ma20: 7,
      ma50: 6,
      ma50_tb5d: 1,
      roc_ts: 4
    }
  ];

  return {
    from(name) {
      if (name === "stock_latest_snapshot") {
        return createQueryBuilder(() => ({
          data: null,
          error: { message: "canceling statement due to statement timeout" }
        }));
      }

      if (name !== "stock_indicators") {
        throw new Error(`Unexpected table: ${name}`);
      }

      return createQueryBuilder((state) => {
        const start = state.rangeStart ?? 0;

        if (state.columns === "date") {
          if (start === 0) {
            return {
              data: Array.from({ length: 1000 }, () => ({ date: "2026-07-15" })),
              error: null
            };
          }

          if (start === 1000) {
            return {
              data: [{ date: "2026-07-14" }],
              error: null
            };
          }

          return { data: [], error: null };
        }

        if (state.inFilter) {
          if (start === 0) {
            return {
              data: historyPageOne,
              error: null
            };
          }

          if (start === 1000) {
            return {
              data: historyPageTwo,
              error: null
            };
          }

          return { data: [], error: null };
        }

        if (start === 0) {
          return {
            data: latestPageOne,
            error: null
          };
        }

        if (start === 1000) {
          return {
            data: latestPageTwo,
            error: null
          };
        }

        return { data: [], error: null };
      });
    }
  };
}

test("fetchMarketSnapshot paginates fallback table queries beyond Supabase's default 1000-row cap", async () => {
  const snapshot = await fetchMarketSnapshot({
    client: createPaginatedClient(),
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "test-service-role",
      SUPABASE_STOCK_TABLE: "stock_indicators",
      SUPABASE_STOCK_SNAPSHOT_VIEW: "stock_latest_snapshot",
      SUPABASE_BENCHMARK_SYMBOL: "VNINDEX",
      SUPABASE_RECENT_DATE_COUNT: "2",
      SUPABASE_FRESHNESS_WINDOW: "2"
    }
  });

  assert.equal(snapshot.snapshotView, "stock_indicators:fallback");
  assert.deepEqual(snapshot.recentDates, ["2026-07-15", "2026-07-14"]);
  assert.equal(snapshot.latestRows.length, 1001);
  assert.equal(snapshot.latestRows.at(-1).symbol, "ZZZ_LAST");
  assert.equal(snapshot.historyRows.length, 1001);
  assert.equal(snapshot.historyRows.at(-1).symbol, "HIS_LAST");
});
