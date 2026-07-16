import { composeMarketDashboardPayload } from "./dashboardPayload.js";
import { fetchMarketSnapshot } from "./snapshotRepository.js";
import { getServerConfig } from "./supabaseAdmin.js";
import {
  readMarketDashboardCache,
  writeMarketDashboardCache
} from "./marketDashboardCacheRepository.js";

function isCacheUnavailableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    message.includes("timed out") ||
    message.includes("could not find the table") ||
    message.includes("relation") ||
    message.includes("market_dashboard_cache")
  );
}

export function buildMarketDashboardCacheEntry(payload, options = {}) {
  const config = getServerConfig(options.env);

  return {
    cacheKey: config.marketDashboardCacheKey,
    dataDate: payload?.dataDate || null,
    generatedAt: payload?.syncedAt || new Date().toISOString(),
    payload
  };
}

export async function loadMarketDashboardPayload(options = {}) {
  console.time("Supabase Query");
  try {
    const cacheReader =
      options.cacheReader || ((readerOptions) => readMarketDashboardCache(readerOptions));
    let payload;

    try {
      payload = await cacheReader({
        client: options.client,
        env: options.env
      });
    } catch (error) {
      if (isCacheUnavailableError(error)) {
        const cacheError = new Error(
          "Market dashboard cache is unavailable. Run the cache SQL migration and refresh job before serving this endpoint."
        );
        cacheError.code = "MARKET_DASHBOARD_CACHE_MISS";
        throw cacheError;
      }

      throw error;
    }

    if (payload) {
      return payload;
    }

    if (typeof options.fallbackBuilder === "function") {
      const fallbackPayload = await options.fallbackBuilder();
      if (fallbackPayload) {
        return fallbackPayload;
      }
    }
  } finally {
    console.timeEnd("Supabase Query");
  }

  const error = new Error(
    "Market dashboard cache is empty. Run the background refresh job before serving this endpoint."
  );
  error.code = "MARKET_DASHBOARD_CACHE_MISS";
  throw error;
}

export async function updateMarketData(options = {}) {
  const snapshotRepository = options.snapshotRepository || fetchMarketSnapshot;
  const payloadBuilder = options.payloadBuilder;
  const cacheWriter = options.cacheWriter || ((entry) => writeMarketDashboardCache(entry, options));

  console.time("Total Request");
  try {
    let payload;

    if (typeof payloadBuilder === "function") {
      console.time("Data Processing");
      try {
        payload = await payloadBuilder();
      } finally {
        console.timeEnd("Data Processing");
      }
    } else {
      console.time("Supabase Query");
      const snapshot = await snapshotRepository(options.repositoryOptions);
      console.timeEnd("Supabase Query");

      console.time("Data Processing");
      try {
        payload = composeMarketDashboardPayload(snapshot, options);
      } finally {
        console.timeEnd("Data Processing");
      }
    }

    const cacheEntry = buildMarketDashboardCacheEntry(payload, options);

    console.time("Insert/Update");
    try {
      await cacheWriter(cacheEntry);
    } finally {
      console.timeEnd("Insert/Update");
    }

    return {
      payload,
      cacheEntry
    };
  } finally {
    console.timeEnd("Total Request");
  }
}
