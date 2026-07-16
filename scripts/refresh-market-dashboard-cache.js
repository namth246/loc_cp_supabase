import { updateMarketData } from "../src/server/marketDashboardCacheService.js";

async function main() {
  const result = await updateMarketData();
  console.log(
    JSON.stringify(
      {
        ok: true,
        dataDate: result.payload?.dataDate || null,
        cacheKey: result.cacheEntry?.cacheKey || null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
