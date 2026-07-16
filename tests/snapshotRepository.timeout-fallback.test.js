import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

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

function createDelayedClient(delayMs) {
  return {
    from(name) {
      if (name === "stock_latest_snapshot") {
        return createQueryBuilder(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    data: null,
                    error: { message: "statement timeout" }
                  }),
                delayMs
              )
            )
        );
      }

      if (name !== "stock_indicators") {
        throw new Error(`Unexpected table: ${name}`);
      }

      return createQueryBuilder(
        (state) =>
          new Promise((resolve) =>
            setTimeout(() => {
              if (state.columns === "date") {
                resolve({
                  data: [
                    { date: "2026-07-15" },
                    { date: "2026-07-14" },
                    { date: "2026-07-13" }
                  ],
                  error: null
                });
                return;
              }

              if (state.inFilter) {
                resolve({
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
                      symbol: "VNINDEX",
                      close: 1200,
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
                  error: null
                });
                return;
              }

              resolve({
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
                    symbol: "VNINDEX",
                    close: 1200,
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
                error: null
              });
            }, delayMs)
          )
      );
    }
  };
}

test("fetchMarketSnapshot finishes within the Vercel budget by timing out the snapshot view early", async () => {
  const start = performance.now();

  const snapshot = await fetchMarketSnapshot({
    client: createDelayedClient(400),
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "test-service-role",
      SUPABASE_STOCK_TABLE: "stock_indicators",
      SUPABASE_STOCK_SNAPSHOT_VIEW: "stock_latest_snapshot",
      SUPABASE_BENCHMARK_SYMBOL: "VNINDEX",
      SUPABASE_RECENT_DATE_COUNT: "3",
      SUPABASE_FRESHNESS_WINDOW: "2",
      SUPABASE_SNAPSHOT_VIEW_TIMEOUT_MS: "100"
    }
  });

  const elapsedMs = performance.now() - start;

  assert.equal(snapshot.snapshotView, "stock_indicators:fallback");
  assert.ok(
    elapsedMs < 1400,
    `expected fetchMarketSnapshot to stay under 1400ms, received ${elapsedMs.toFixed(1)}ms`
  );
});

function createFallbackReuseClient() {
  const fallbackRows = [
    ...buildRows(0, 2, "2026-07-15", "LATE"),
    ...buildRows(0, 2, "2026-07-14", "MID"),
    ...buildRows(0, 2, "2026-07-13", "EARLY"),
    {
      date: "2026-07-12",
      symbol: "STALE_ONLY",
      close: 7,
      volume: 200000,
      high_tb4d: 6.5,
      vol_tb10d: 180000,
      roc26: 4,
      ma20: 6,
      ma50: 5,
      ma50_tb5d: 1,
      roc_ts: 2
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
        if (state.columns === "date" || state.inFilter) {
          throw new Error("fallback data should be reused without extra stock_indicators queries");
        }

        return {
          data: fallbackRows,
          error: null
        };
      });
    }
  };
}

test("fetchMarketSnapshot reuses fallback rows instead of querying recent dates and history again", async () => {
  const snapshot = await fetchMarketSnapshot({
    client: createFallbackReuseClient(),
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "test-service-role",
      SUPABASE_STOCK_TABLE: "stock_indicators",
      SUPABASE_STOCK_SNAPSHOT_VIEW: "stock_latest_snapshot",
      SUPABASE_BENCHMARK_SYMBOL: "VNINDEX",
      SUPABASE_RECENT_DATE_COUNT: "3",
      SUPABASE_FRESHNESS_WINDOW: "3"
    }
  });

  assert.equal(snapshot.snapshotView, "stock_indicators:fallback");
  assert.deepEqual(snapshot.recentDates, ["2026-07-15", "2026-07-14", "2026-07-13"]);
  assert.equal(snapshot.latestRows.length, 7);
  assert.equal(snapshot.historyRows.length, 6);
  assert.equal(snapshot.latestRows.at(-1).symbol, "STALE_ONLY");
});

function buildWindowRows(date) {
  return buildRows(0, 1000, date, "WINDOW");
}

function createOverfetchFallbackClient() {
  const fallbackPages = [
    buildWindowRows("2026-07-15"),
    buildWindowRows("2026-07-14"),
    buildWindowRows("2026-07-13"),
    buildWindowRows("2026-07-12"),
    buildWindowRows("2026-07-11"),
    buildWindowRows("2026-07-10"),
    buildWindowRows("2026-07-09"),
    buildWindowRows("2026-07-08"),
    buildWindowRows("2026-07-07"),
    buildWindowRows("2026-07-06")
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

        if (state.columns === "date" || state.inFilter) {
          throw new Error("fallback window should already satisfy date/history needs");
        }

        if (state.columns !== "date,symbol" && start >= 10000) {
          throw new Error("fallback scan exceeded freshness window budget");
        }

        const pageIndex = Math.floor(start / 1000);
        return {
          data: fallbackPages[pageIndex] || [],
          error: null
        };
      });
    }
  };
}

test("fetchMarketSnapshot does not overfetch fallback pages beyond the freshness window budget", async () => {
  const snapshot = await fetchMarketSnapshot({
    client: createOverfetchFallbackClient(),
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "test-service-role",
      SUPABASE_STOCK_TABLE: "stock_indicators",
      SUPABASE_STOCK_SNAPSHOT_VIEW: "stock_latest_snapshot",
      SUPABASE_BENCHMARK_SYMBOL: "VNINDEX",
      SUPABASE_RECENT_DATE_COUNT: "10",
      SUPABASE_FRESHNESS_WINDOW: "5"
    }
  });

  assert.equal(snapshot.snapshotView, "stock_indicators:fallback");
  assert.deepEqual(snapshot.recentDates, [
    "2026-07-15",
    "2026-07-14",
    "2026-07-13",
    "2026-07-12",
    "2026-07-11"
  ]);
  assert.equal(snapshot.latestRows.length, 1000);
  assert.equal(snapshot.historyRows.length, 5000);
});

function createStaleCoverageFallbackClient() {
  const fullHistoryPages = [
    buildWindowRows("2026-07-15"),
    buildWindowRows("2026-07-14"),
    buildWindowRows("2026-07-13"),
    buildWindowRows("2026-07-12"),
    buildWindowRows("2026-07-11")
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
        const pageIndex = Math.floor(start / 1000);

        if (state.columns === "date") {
          throw new Error("recent date query should be satisfied from fallback rows");
        }

        if (state.inFilter) {
          throw new Error("history query should be satisfied from fallback rows");
        }

        if (state.columns === "date,symbol") {
          if (pageIndex < fullHistoryPages.length) {
            return {
              data: fullHistoryPages[pageIndex].map((row) => ({
                date: row.date,
                symbol: row.symbol
              })),
              error: null
            };
          }

          if (pageIndex === fullHistoryPages.length) {
            return {
              data: [{ date: "2026-07-10", symbol: "STALE_OLD" }],
              error: null
            };
          }

          return { data: [], error: null };
        }

        if (pageIndex < fullHistoryPages.length) {
          return {
            data: fullHistoryPages[pageIndex],
            error: null
          };
        }

        return { data: [], error: null };
      });
    }
  };
}

test("fetchMarketSnapshot preserves stale latest symbols beyond the freshness window", async () => {
  const snapshot = await fetchMarketSnapshot({
    client: createStaleCoverageFallbackClient(),
    env: {
      SUPABASE_URL: "https://example.supabase.co/rest/v1",
      SUPABASE_KEY: "test-service-role",
      SUPABASE_STOCK_TABLE: "stock_indicators",
      SUPABASE_STOCK_SNAPSHOT_VIEW: "stock_latest_snapshot",
      SUPABASE_BENCHMARK_SYMBOL: "VNINDEX",
      SUPABASE_RECENT_DATE_COUNT: "10",
      SUPABASE_FRESHNESS_WINDOW: "5"
    }
  });

  assert.equal(snapshot.snapshotView, "stock_indicators:fallback");
  assert.equal(snapshot.historyRows.length, 5000);
  assert.ok(snapshot.latestRows.some((row) => row.symbol === "STALE_OLD" && row.date === "2026-07-10"));
});
