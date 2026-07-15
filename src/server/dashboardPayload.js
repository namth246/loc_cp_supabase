import { buildSnapshotWithRs } from "./rsCalculator.js";
import { buildBenchmarkMap, buildScreeningResult } from "./screenerService.js";
import { fetchMarketSnapshot } from "./snapshotRepository.js";

export async function buildMarketDashboardPayload(options = {}) {
  const snapshot = await (options.repository || fetchMarketSnapshot)(options.repositoryOptions);
  const freshnessWindowSessions =
    options.freshnessWindowSessions || snapshot.freshnessWindowSessions || 5;
  const recentDates = snapshot.recentDates || [];
  const freshnessDates = recentDates.slice(0, freshnessWindowSessions);
  const snapshotRows = buildSnapshotWithRs(snapshot.latestRows || [], snapshot.historyRows || [], {
    freshnessDates
  });
  const benchmarkByDate = buildBenchmarkMap(
    snapshot.historyRows || [],
    snapshot.benchmarkSymbol || "VNINDEX"
  );
  const screening = buildScreeningResult(snapshotRows, {
    benchmarkByDate,
    benchmarkSymbol: snapshot.benchmarkSymbol || "VNINDEX",
    freshnessDates,
    dataDate: recentDates[0] || null
  });

  return {
    source: "supabase",
    syncedAt: new Date().toISOString(),
    dataDate: recentDates[0] || null,
    warnings: screening.warnings,
    req1Rows: screening.req1Rows,
    req2Rows: screening.req2Rows,
    meta: {
      ...screening.meta,
      rsDates: recentDates.slice(0, 3),
      snapshotView: snapshot.snapshotView || null,
      tableName: snapshot.tableName || null
    }
  };
}
