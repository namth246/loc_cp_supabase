import { buildMarketDashboardPayload } from "../src/server/dashboardPayload.js";

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
    const payload = await buildMarketDashboardPayload();
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, {
      source: "supabase",
      error: {
        code: "MARKET_DASHBOARD_ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }
}
