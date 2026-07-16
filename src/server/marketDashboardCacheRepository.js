import { createSupabaseAdminClient, getServerConfig } from "./supabaseAdmin.js";

const CACHE_COLUMNS = "cache_key,data_date,generated_at,payload";

let inMemoryCache = {
  cacheKey: null,
  expiresAt: 0,
  payload: null
};

function clonePayload(payload) {
  if (payload == null) {
    return null;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }

  return JSON.parse(JSON.stringify(payload));
}

function cachePayloadLocally(cacheKey, payload, ttlMs) {
  inMemoryCache = {
    cacheKey,
    expiresAt: Date.now() + ttlMs,
    payload: clonePayload(payload)
  };
}

function getFreshMemoryPayload(cacheKey) {
  if (
    inMemoryCache.cacheKey === cacheKey &&
    inMemoryCache.payload &&
    inMemoryCache.expiresAt > Date.now()
  ) {
    return clonePayload(inMemoryCache.payload);
  }

  return null;
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`Market dashboard cache query timed out after ${timeoutMs}ms.`);
  error.name = "AbortError";
  return error;
}

async function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCachePayload(row) {
  return row?.payload && typeof row.payload === "object" ? clonePayload(row.payload) : null;
}

export function clearMarketDashboardMemoryCache() {
  inMemoryCache = {
    cacheKey: null,
    expiresAt: 0,
    payload: null
  };
}

export async function readMarketDashboardCache(options = {}) {
  const config = getServerConfig(options.env);
  const cachedPayload = getFreshMemoryPayload(config.marketDashboardCacheKey);

  if (cachedPayload) {
    return cachedPayload;
  }

  const client = options.client || createSupabaseAdminClient(options.env);
  const response = await withTimeout(
    client
      .from(config.marketDashboardCacheTable)
      .select(CACHE_COLUMNS)
      .eq("cache_key", config.marketDashboardCacheKey)
      .order("generated_at", { ascending: false })
      .limit(1),
    config.marketDashboardCacheTimeoutMs
  );

  if (response?.error) {
    throw response.error;
  }

  const payload = normalizeCachePayload(Array.isArray(response?.data) ? response.data[0] : null);
  if (!payload) {
    return null;
  }

  cachePayloadLocally(
    config.marketDashboardCacheKey,
    payload,
    config.marketDashboardMemoryCacheTtlMs
  );

  return clonePayload(payload);
}

export async function writeMarketDashboardCache(entry, options = {}) {
  const config = getServerConfig(options.env);
  const client = options.client || createSupabaseAdminClient(options.env);
  const payload = clonePayload(entry.payload);
  const cacheKey = entry.cacheKey || config.marketDashboardCacheKey;

  const response = await client.from(config.marketDashboardCacheTable).upsert(
    {
      cache_key: cacheKey,
      data_date: entry.dataDate,
      generated_at: entry.generatedAt || new Date().toISOString(),
      payload
    },
    {
      onConflict: "cache_key,data_date"
    }
  );

  if (response?.error) {
    throw response.error;
  }

  cachePayloadLocally(cacheKey, payload, config.marketDashboardMemoryCacheTtlMs);

  return {
    cacheKey,
    dataDate: entry.dataDate,
    payload
  };
}
