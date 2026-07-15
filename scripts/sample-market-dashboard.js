import { buildMarketDashboardPayload } from "../src/server/dashboardPayload.js";

const payload = await buildMarketDashboardPayload();
console.log(JSON.stringify(payload, null, 2));
