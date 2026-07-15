import { fetchMarketSnapshot } from "../src/server/snapshotRepository.js";
import { getServerConfig } from "../src/server/supabaseAdmin.js";

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

  try {
    const config = getServerConfig();
    const snapshot = await fetchMarketSnapshot();
    sendJson(res, 200, {
      status: "ok",
      source: "supabase",
      dataDate: snapshot.recentDates?.[0] || null,
      universeSize: snapshot.latestRows?.length || 0,
      benchmarkSymbol: config.benchmarkSymbol,
      snapshotView: config.snapshotView
    });
  } catch (error) {
    sendJson(res, 500, {
      status: "error",
      source: "supabase",
      error: {
        code: "HEALTH_CHECK_ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }
}
