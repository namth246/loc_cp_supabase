import { createClient } from "@supabase/supabase-js";

const DEFAULT_TABLE_NAME = "stock_indicators";
const DEFAULT_SNAPSHOT_VIEW = "stock_latest_snapshot";
const DEFAULT_BENCHMARK_SYMBOL = "VNINDEX";
const DEFAULT_RECENT_DATE_COUNT = 10;
const DEFAULT_FRESHNESS_WINDOW = 5;

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
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (SUPABASE_KEY fallback is also supported)."
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    tableName: (env.SUPABASE_STOCK_TABLE || DEFAULT_TABLE_NAME).trim(),
    snapshotView: (env.SUPABASE_STOCK_SNAPSHOT_VIEW || DEFAULT_SNAPSHOT_VIEW).trim(),
    benchmarkSymbol: (env.SUPABASE_BENCHMARK_SYMBOL || DEFAULT_BENCHMARK_SYMBOL).trim(),
    recentDateCount: toPositiveInteger(env.SUPABASE_RECENT_DATE_COUNT, DEFAULT_RECENT_DATE_COUNT),
    freshnessWindowSessions: toPositiveInteger(
      env.SUPABASE_FRESHNESS_WINDOW,
      DEFAULT_FRESHNESS_WINDOW
    )
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
