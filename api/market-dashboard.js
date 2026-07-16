import { loadMarketDashboardPayload } from "../src/server/marketDashboardCacheService.js";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    sendJson(res, 405, {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Only GET is supported."
      }
    });
    return;
  }

  console.time("Total Request");
  try {
    const payload = await loadMarketDashboardPayload();
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 200, payload);
  } catch (error) {
    const isCacheMiss = error?.code === "MARKET_DASHBOARD_CACHE_MISS";

    sendJson(res, isCacheMiss ? 503 : 500, {
      source: "supabase",
      error: {
        code: isCacheMiss ? "MARKET_DASHBOARD_CACHE_MISS" : "MARKET_DASHBOARD_ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  } finally {
    console.timeEnd("Total Request");
  }
}
