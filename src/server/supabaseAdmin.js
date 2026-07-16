import { createClient } from "@supabase/supabase-js";

const DEFAULT_TABLE_NAME = "stock_indicators";
const DEFAULT_SNAPSHOT_VIEW = "stock_latest_snapshot";
const DEFAULT_DASHBOARD_CACHE_TABLE = "market_dashboard_cache";
const DEFAULT_DASHBOARD_CACHE_KEY = "market_dashboard";
const DEFAULT_BENCHMARK_SYMBOL = "VNINDEX";
const DEFAULT_RECENT_DATE_COUNT = 10;
const DEFAULT_FRESHNESS_WINDOW = 5;
const DEFAULT_QUERY_TIMEOUT_MS = 2500;
const DEFAULT_SNAPSHOT_VIEW_TIMEOUT_MS = 1200;
const DEFAULT_QUERY_RETRY_COUNT = 1;
const DEFAULT_DASHBOARD_CACHE_TIMEOUT_MS = 800;
const DEFAULT_MEMORY_CACHE_TTL_MS = 60000;

function toPositiveInteger(rawValue, fallbackValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function normalizeSupabaseUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function getServerConfig(env = process.env) {
  const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    env.SUPABASE_KEY?.trim() ||
    env.SUPABASE_SERVICE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (SUPABASE_KEY fallback is also supported). Add them in Vercel Project Settings -> Environment Variables, then redeploy."
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    tableName: (env.SUPABASE_STOCK_TABLE || DEFAULT_TABLE_NAME).trim(),
    snapshotView: (env.SUPABASE_STOCK_SNAPSHOT_VIEW || DEFAULT_SNAPSHOT_VIEW).trim(),
    marketDashboardCacheTable: (
      env.SUPABASE_MARKET_DASHBOARD_CACHE_TABLE || DEFAULT_DASHBOARD_CACHE_TABLE
    ).trim(),
    marketDashboardCacheKey: (
      env.SUPABASE_MARKET_DASHBOARD_CACHE_KEY || DEFAULT_DASHBOARD_CACHE_KEY
    ).trim(),
    benchmarkSymbol: (env.SUPABASE_BENCHMARK_SYMBOL || DEFAULT_BENCHMARK_SYMBOL).trim(),
    recentDateCount: toPositiveInteger(env.SUPABASE_RECENT_DATE_COUNT, DEFAULT_RECENT_DATE_COUNT),
    freshnessWindowSessions: toPositiveInteger(
      env.SUPABASE_FRESHNESS_WINDOW,
      DEFAULT_FRESHNESS_WINDOW
    ),
    queryTimeoutMs: toPositiveInteger(env.SUPABASE_QUERY_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS),
    snapshotViewTimeoutMs: toPositiveInteger(
      env.SUPABASE_SNAPSHOT_VIEW_TIMEOUT_MS,
      DEFAULT_SNAPSHOT_VIEW_TIMEOUT_MS
    ),
    queryRetryCount: toPositiveInteger(env.SUPABASE_QUERY_RETRY_COUNT, DEFAULT_QUERY_RETRY_COUNT),
    marketDashboardCacheTimeoutMs: toPositiveInteger(
      env.SUPABASE_MARKET_DASHBOARD_CACHE_TIMEOUT_MS,
      DEFAULT_DASHBOARD_CACHE_TIMEOUT_MS
    ),
    marketDashboardMemoryCacheTtlMs: toPositiveInteger(
      env.MARKET_DASHBOARD_MEMORY_CACHE_TTL_MS,
      DEFAULT_MEMORY_CACHE_TTL_MS
    ),
    debugLogging: String(env.DEBUG_MARKET_DASHBOARD || "").trim() === "1"
  };
}

export function createSupabaseAdminClient(env = process.env) {
  const config = getServerConfig(env);
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        "X-Client-Info": "loc-cp-cnf-market-dashboard"
      }
    }
  });
}
