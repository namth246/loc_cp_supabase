import { createSupabaseAdminClient, getServerConfig } from "./supabaseAdmin.js";

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

const DATE_SCAN_MULTIPLIER = 2000;
const MIN_DATE_SCAN_ROWS = 5000;
const MAX_DATE_SCAN_ROWS = 20000;
const SUPABASE_PAGE_SIZE = 1000;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
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
  return message.includes("statement timeout");
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

async function fetchPagedRows(buildQuery, options = {}) {
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const shouldStop = options.shouldStop ?? (() => false);
  const rows = [];

  for (let start = 0; start < maxRows; start += SUPABASE_PAGE_SIZE) {
    const end = Math.min(start + SUPABASE_PAGE_SIZE - 1, maxRows - 1);
    const { data, error } = await buildQuery().range(start, end);

    if (error) {
      throw error;
    }

    const batch = ensureArray(data);
    rows.push(...batch);

    if (shouldStop(rows, batch)) {
      break;
    }

    if (!batch.length || batch.length < end - start + 1) {
      break;
    }
  }

  return rows;
}

async function fetchLatestSnapshotFallback(client, tableName, desiredCount) {
  const rowLimit = Math.min(
    MAX_DATE_SCAN_ROWS,
    Math.max(MIN_DATE_SCAN_ROWS, desiredCount * DATE_SCAN_MULTIPLIER)
  );

  try {
    const rows = await fetchPagedRows(
      () =>
        client
          .from(tableName)
          .select(SNAPSHOT_COLUMNS)
          .order("date", { ascending: false })
          .order("symbol", { ascending: true }),
      { maxRows: rowLimit }
    );

    return buildFallbackSnapshotRows(rows);
  } catch (error) {
    throw new Error(`Supabase fallback snapshot query failed: ${error.message}`);
  }
}

export async function fetchLatestSnapshot(client, snapshotView) {
  const { data, error } = await client
    .from(snapshotView)
    .select(SNAPSHOT_COLUMNS)
    .order("symbol", { ascending: true });

  if (error) {
    throw new Error(`Supabase latest snapshot query failed: ${error.message}`);
  }

  return ensureArray(data);
}

export async function fetchRecentDates(client, tableName, desiredCount) {
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
        shouldStop: (allRows) => uniqueDatesDescending(allRows, desiredCount).length >= desiredCount
      }
    );

    return uniqueDatesDescending(rows, desiredCount);
  } catch (error) {
    throw new Error(`Supabase recent date query failed: ${error.message}`);
  }
}

export async function fetchHistoryRowsByDates(client, tableName, dates) {
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
      { maxRows: rowLimit }
    );
  } catch (error) {
    throw new Error(`Supabase history query failed: ${error.message}`);
  }
}

export async function fetchMarketSnapshot(options = {}) {
  const config = getServerConfig(options.env);
  const client = options.client || createSupabaseAdminClient(options.env);
  const desiredCount = options.recentDateCount || config.recentDateCount;
  const recentDates = await fetchRecentDates(client, config.tableName, desiredCount);
  let latestRows;
  let snapshotView = config.snapshotView;

  try {
    latestRows = await fetchLatestSnapshot(client, config.snapshotView);
  } catch (error) {
    if (!isMissingSnapshotViewError(error) && !isSnapshotViewTimeoutError(error)) {
      throw error;
    }

    latestRows = await fetchLatestSnapshotFallback(client, config.tableName, desiredCount);
    snapshotView = `${config.tableName}:fallback`;
  }
  const historyRows = await fetchHistoryRowsByDates(client, config.tableName, recentDates);

  return {
    latestRows,
    recentDates,
    historyRows,
    benchmarkSymbol: config.benchmarkSymbol,
    snapshotView,
    tableName: config.tableName,
    freshnessWindowSessions: config.freshnessWindowSessions
  };
}
