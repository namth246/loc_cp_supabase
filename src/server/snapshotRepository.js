import { createSupabaseAdminClient, getServerConfig } from "./supabaseAdmin.js";
import { performance } from "node:perf_hooks";

const SNAPSHOT_COLUMNS = [
  "date",
  "symbol",
  "close",
  "volume",
  "high_tb4d",
  "vol_tb10d",
  "roc26",
  "ma20",
  "ma50",
  "ma50_tb5d",
  "roc_ts"
].join(",");
const SNAPSHOT_REF_COLUMNS = ["date", "symbol"].join(",");

const DATE_SCAN_MULTIPLIER = 2000;
const MIN_DATE_SCAN_ROWS = 5000;
const MAX_DATE_SCAN_ROWS = 20000;
const SUPABASE_PAGE_SIZE = 1000;
const MIN_REQUIRED_HISTORY_DATES = 3;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function debugLog(config, message, details) {
  if (!config?.debugLogging) {
    return;
  }

  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[market-dashboard] ${message}${suffix}`);
}

function uniqueDatesDescending(rows, limit) {
  const seen = new Set();
  const dates = [];

  for (const row of rows) {
    const date = row?.date;
    if (!date || seen.has(date)) {
      continue;
    }

    seen.add(date);
    dates.push(date);

    if (dates.length >= limit) {
      break;
    }
  }

  return dates;
}

function isMissingSnapshotViewError(error) {
  const message = String(error?.message || "");
  return message.includes("Could not find the table") || message.includes("schema cache");
}

function isSnapshotViewTimeoutError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("statement timeout") ||
    message.includes("Request timed out") ||
    error?.name === "AbortError"
  );
}

function isRetryableQueryError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("network")
  );
}

function createTimeoutError(label, timeoutMs) {
  const error = new Error(`${label} timed out after ${timeoutMs}ms.`);
  error.name = "AbortError";
  return error;
}

function attachAbortSignal(query, signal) {
  if (signal && query && typeof query.abortSignal === "function") {
    return query.abortSignal(signal);
  }

  return query;
}

async function withTimeout(promise, timeoutMs, label, onTimeout) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(createTimeoutError(label, timeoutMs));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function executeQuery(buildRequest, options = {}) {
  const label = options.label || "Supabase query";
  const timeoutMs = options.timeoutMs;
  const retryCount = Math.max(0, options.retryCount ?? 0);
  const config = options.config;
  let attempt = 0;

  while (attempt <= retryCount) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const startedAt = performance.now();

    try {
      const result = await withTimeout(
        Promise.resolve(buildRequest(controller?.signal)),
        timeoutMs,
        label,
        () => controller?.abort()
      );

      if (result?.error) {
        throw result.error;
      }

      debugLog(config, `${label} completed`, {
        attempt: attempt + 1,
        elapsedMs: Math.round(performance.now() - startedAt),
        rowCount: ensureArray(result?.data).length
      });

      return result;
    } catch (error) {
      debugLog(config, `${label} failed`, {
        attempt: attempt + 1,
        elapsedMs: Math.round(performance.now() - startedAt),
        message: error.message
      });

      if (attempt >= retryCount || !isRetryableQueryError(error)) {
        throw error;
      }
    }

    attempt += 1;
  }

  throw new Error(`${label} exhausted retries.`);
}

function buildFallbackSnapshotRows(rows) {
  const snapshotBySymbol = new Map();

  for (const row of rows) {
    if (!row?.symbol || snapshotBySymbol.has(row.symbol)) {
      continue;
    }

    snapshotBySymbol.set(row.symbol, row);
  }

  return [...snapshotBySymbol.values()].sort((left, right) =>
    String(left.symbol || "").localeCompare(String(right.symbol || ""))
  );
}

function buildRowKey(row) {
  return `${row?.symbol || ""}::${row?.date || ""}`;
}

function filterRowsByDates(rows, dates) {
  const dateSet = new Set(dates);
  return rows.filter((row) => row?.date && dateSet.has(row.date));
}

function buildLatestRowsFromReferences(latestRowReferences, detailedRows) {
  const detailedRowByKey = new Map();

  for (const row of detailedRows) {
    const key = buildRowKey(row);
    if (!row?.symbol || !row?.date || detailedRowByKey.has(key)) {
      continue;
    }

    detailedRowByKey.set(key, row);
  }

  return buildFallbackSnapshotRows(latestRowReferences).map((row) => {
    return detailedRowByKey.get(buildRowKey(row)) || { date: row.date, symbol: row.symbol };
  });
}

async function fetchPagedRows(buildQuery, options = {}) {
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const shouldStop = options.shouldStop ?? (() => false);
  const rows = [];
  let reachedEnd = false;

  for (let start = 0; start < maxRows; start += SUPABASE_PAGE_SIZE) {
    const end = Math.min(start + SUPABASE_PAGE_SIZE - 1, maxRows - 1);
    const { data } = await executeQuery(
      (signal) => attachAbortSignal(buildQuery(), signal).range(start, end),
      {
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        label: `${options.label || "Supabase paged query"} [${start}-${end}]`,
        config: options.config
      }
    );

    const batch = ensureArray(data);
    rows.push(...batch);

    if (shouldStop(rows, batch)) {
      break;
    }

    if (!batch.length || batch.length < end - start + 1) {
      reachedEnd = true;
      break;
    }
  }

  if (options.returnMeta) {
    return { rows, reachedEnd };
  }

  return rows;
}

async function fetchLatestSnapshotFallback(client, tableName, desiredCount, options = {}) {
  const rowLimit = Math.min(
    MAX_DATE_SCAN_ROWS,
    Math.max(MIN_DATE_SCAN_ROWS, desiredCount * DATE_SCAN_MULTIPLIER)
  );

  try {
    const { rows, reachedEnd } = await fetchPagedRows(
      () =>
        client
          .from(tableName)
          .select(SNAPSHOT_COLUMNS)
          .order("date", { ascending: false })
          .order("symbol", { ascending: true }),
      {
        maxRows: rowLimit,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        label: "Supabase fallback snapshot query",
        config: options.config,
        returnMeta: true
      }
    );

    return { rows, reachedEnd };
  } catch (error) {
    throw new Error(`Supabase fallback snapshot query failed: ${error.message}`);
  }
}

async function fetchLatestSnapshotFallbackRefs(client, tableName, scanCount, options = {}) {
  const rowLimit = Math.min(
    MAX_DATE_SCAN_ROWS,
    Math.max(MIN_DATE_SCAN_ROWS, scanCount * DATE_SCAN_MULTIPLIER)
  );

  try {
    return await fetchPagedRows(
      () =>
        client
          .from(tableName)
          .select(SNAPSHOT_REF_COLUMNS)
          .order("date", { ascending: false })
          .order("symbol", { ascending: true }),
      {
        maxRows: rowLimit,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        label: "Supabase fallback latest-ref query",
        config: options.config,
        returnMeta: true
      }
    );
  } catch (error) {
    throw new Error(`Supabase fallback latest-ref query failed: ${error.message}`);
  }
}

export async function fetchLatestSnapshot(client, snapshotView, options = {}) {
  const { data } = await executeQuery(
    (signal) =>
      attachAbortSignal(
        client.from(snapshotView).select(SNAPSHOT_COLUMNS).order("symbol", { ascending: true }),
        signal
      ),
    {
      timeoutMs: options.timeoutMs,
      retryCount: options.retryCount,
      label: "Supabase latest snapshot query",
      config: options.config
    }
  );

  return ensureArray(data);
}

export async function fetchRecentDates(client, tableName, desiredCount, options = {}) {
  const rowLimit = Math.min(
    MAX_DATE_SCAN_ROWS,
    Math.max(MIN_DATE_SCAN_ROWS, desiredCount * DATE_SCAN_MULTIPLIER)
  );

  try {
    const rows = await fetchPagedRows(
      () =>
        client
          .from(tableName)
          .select("date")
          .order("date", { ascending: false }),
      {
        maxRows: rowLimit,
        shouldStop: (allRows) => uniqueDatesDescending(allRows, desiredCount).length >= desiredCount,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        label: "Supabase recent date query",
        config: options.config
      }
    );

    return uniqueDatesDescending(rows, desiredCount);
  } catch (error) {
    throw new Error(`Supabase recent date query failed: ${error.message}`);
  }
}

export async function fetchHistoryRowsByDates(client, tableName, dates, options = {}) {
  if (!dates.length) {
    return [];
  }

  const rowLimit = Math.min(
    MAX_DATE_SCAN_ROWS,
    Math.max(MIN_DATE_SCAN_ROWS, dates.length * DATE_SCAN_MULTIPLIER)
  );

  try {
    return await fetchPagedRows(
      () =>
        client
          .from(tableName)
          .select(SNAPSHOT_COLUMNS)
          .in("date", dates)
          .order("date", { ascending: false })
          .order("symbol", { ascending: true }),
      {
        maxRows: rowLimit,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        label: "Supabase history query",
        config: options.config
      }
    );
  } catch (error) {
    throw new Error(`Supabase history query failed: ${error.message}`);
  }
}

async function fetchLatestSnapshotWithFallback(client, config, desiredCount) {
  try {
    const latestRows = await fetchLatestSnapshot(client, config.snapshotView, {
      timeoutMs: config.snapshotViewTimeoutMs,
      retryCount: 0,
      config
    });

    return {
      latestRows,
      snapshotView: config.snapshotView
    };
  } catch (error) {
    if (!isMissingSnapshotViewError(error) && !isSnapshotViewTimeoutError(error)) {
      throw error;
    }

    debugLog(config, "Snapshot view fallback activated", {
      snapshotView: config.snapshotView,
      reason: error.message
    });

    const { rows, reachedEnd } = await fetchLatestSnapshotFallback(
      client,
      config.tableName,
      desiredCount,
      {
        timeoutMs: config.queryTimeoutMs,
        retryCount: config.queryRetryCount,
        config
      }
    );
    const recentDates = uniqueDatesDescending(rows, desiredCount);
    const oldestReusableDate = recentDates.at(-1) || null;
    const lastRowDate = rows.at(-1)?.date || null;
    const canReuseFallbackHistory =
      recentDates.length === desiredCount &&
      (reachedEnd || (lastRowDate && oldestReusableDate && lastRowDate < oldestReusableDate));
    const historyRows = canReuseFallbackHistory ? filterRowsByDates(rows, recentDates) : null;

    if (!canReuseFallbackHistory) {
      return {
        latestRows: buildFallbackSnapshotRows(rows),
        recentDates: null,
        historyRows: null,
        snapshotView: `${config.tableName}:fallback`
      };
    }

    const latestRefRows = await fetchLatestSnapshotFallbackRefs(
      client,
      config.tableName,
      Math.max(config.recentDateCount, desiredCount),
      {
        timeoutMs: config.queryTimeoutMs,
        retryCount: config.queryRetryCount,
        config
      }
    );
    const latestRows = buildLatestRowsFromReferences(latestRefRows.rows, historyRows || rows);

    return {
      latestRows,
      recentDates: canReuseFallbackHistory ? recentDates : null,
      historyRows,
      snapshotView: `${config.tableName}:fallback`
    };
  }
}

export async function fetchMarketSnapshot(options = {}) {
  const config = getServerConfig(options.env);
  const client = options.client || createSupabaseAdminClient(options.env);
  const requiredDateCount = Math.max(config.freshnessWindowSessions, MIN_REQUIRED_HISTORY_DATES);
  const desiredCount = Math.max(options.recentDateCount || 0, requiredDateCount);
  const startedAt = performance.now();

  const latestSnapshotResult = await fetchLatestSnapshotWithFallback(client, config, desiredCount);
  const recentDates =
    latestSnapshotResult.recentDates ||
    (await fetchRecentDates(client, config.tableName, desiredCount, {
      timeoutMs: config.queryTimeoutMs,
      retryCount: config.queryRetryCount,
      config
    }));
  const historyRows =
    latestSnapshotResult.historyRows ||
    (await fetchHistoryRowsByDates(client, config.tableName, recentDates, {
      timeoutMs: config.queryTimeoutMs,
      retryCount: config.queryRetryCount,
      config
    }));

  debugLog(config, "fetchMarketSnapshot completed", {
    elapsedMs: Math.round(performance.now() - startedAt),
    latestRows: latestSnapshotResult.latestRows.length,
    historyRows: historyRows.length,
    recentDates: recentDates.length,
    snapshotView: latestSnapshotResult.snapshotView
  });

  return {
    latestRows: latestSnapshotResult.latestRows,
    recentDates,
    historyRows,
    benchmarkSymbol: config.benchmarkSymbol,
    snapshotView: latestSnapshotResult.snapshotView,
    tableName: config.tableName,
    freshnessWindowSessions: config.freshnessWindowSessions
  };
}
