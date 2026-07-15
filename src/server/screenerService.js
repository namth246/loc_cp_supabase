const INDEX_SYMBOLS = new Set(["VNINDEX", "HNXINDEX"]);
const LIMITED_UNIVERSE_THRESHOLD = 50;

function compareNumberDesc(left, right, fieldName) {
  const leftValue = Number.isFinite(left?.[fieldName]) ? left[fieldName] : -Infinity;
  const rightValue = Number.isFinite(right?.[fieldName]) ? right[fieldName] : -Infinity;
  return rightValue - leftValue;
}

function isIndexSymbol(symbol) {
  return INDEX_SYMBOLS.has(symbol);
}

function hasFiniteNumber(value) {
  return Number.isFinite(value);
}

function getBenchmarkRoc26(benchmarkByDate, date) {
  if (!date) {
    return null;
  }

  const value = benchmarkByDate.get(date);
  return hasFiniteNumber(value) ? value : null;
}

function evaluateReq2Conditions(row, benchmarkByDate) {
  const benchmarkRoc26 = getBenchmarkRoc26(benchmarkByDate, row.date);
  const cond1 = row.volume > 300000;
  const cond2 = hasFiniteNumber(row.rs_avg) && row.rs_avg >= 75 && row.rs_avg <= 90;
  const cond3 =
    hasFiniteNumber(benchmarkRoc26) &&
    hasFiniteNumber(row.roc26) &&
    row.roc26 > benchmarkRoc26 &&
    row.roc26 >= 10 &&
    row.roc26 <= 20;
  const cond4 = hasFiniteNumber(row.close) && hasFiniteNumber(row.ma20) && row.close > row.ma20;
  const cond5 = hasFiniteNumber(row.ma20) && hasFiniteNumber(row.ma50) && row.ma20 > row.ma50;
  const cond6 = hasFiniteNumber(row.ma50_tb5d) && row.ma50_tb5d > 0;
  const isBuyActivated =
    hasFiniteNumber(row.close) &&
    hasFiniteNumber(row.high_tb4d) &&
    hasFiniteNumber(row.volume) &&
    hasFiniteNumber(row.vol_tb10d) &&
    row.close > row.high_tb4d &&
    row.vol_tb10d > 0 &&
    row.volume / row.vol_tb10d > 1.5;

  return {
    benchmarkRoc26,
    cond1,
    cond2,
    cond3,
    cond4,
    cond5,
    cond6,
    isBuyActivated,
    sScore: [cond1, cond2, cond3, cond4, cond5, cond6].filter(Boolean).length
  };
}

export function buildBenchmarkMap(historyRows, benchmarkSymbol = "VNINDEX") {
  const benchmarkByDate = new Map();

  for (const row of historyRows) {
    if (row?.symbol !== benchmarkSymbol || !row?.date || !hasFiniteNumber(row?.roc26)) {
      continue;
    }

    benchmarkByDate.set(row.date, row.roc26);
  }

  return benchmarkByDate;
}

export function buildScreeningResult(snapshotRows, options = {}) {
  const benchmarkSymbol = options.benchmarkSymbol || "VNINDEX";
  const benchmarkByDate = options.benchmarkByDate || new Map();
  const freshnessDates = options.freshnessDates || [];
  const dataDate = options.dataDate || null;

  const benchmarkAvailable = [...benchmarkByDate.keys()].length > 0;
  const equityRows = snapshotRows.filter((row) => !isIndexSymbol(row.symbol));
  const freshRows = equityRows.filter((row) => row.isFresh !== false);
  const staleCount = equityRows.length - freshRows.length;

  const req1Rows = freshRows
    .filter((row) => {
      const benchmarkRoc26 = getBenchmarkRoc26(benchmarkByDate, row.date);
      return row.volume > 300000 && hasFiniteNumber(benchmarkRoc26) && row.roc26 > benchmarkRoc26;
    })
    .sort((left, right) => compareNumberDesc(left, right, "rs1"))
    .slice(0, 10)
    .map((row) => ({
      ...row,
      benchmarkRoc26: getBenchmarkRoc26(benchmarkByDate, row.date)
    }));

  const req2Rows = freshRows
    .map((row) => ({
      ...row,
      ...evaluateReq2Conditions(row, benchmarkByDate)
    }))
    .filter((row) => row.sScore >= 4)
    .sort((left, right) => {
      if (left.sScore !== right.sScore) {
        return right.sScore - left.sScore;
      }

      return compareNumberDesc(left, right, "rs_avg");
    })
    .slice(0, 10);

  const warnings = [];

  if (!benchmarkAvailable) {
    warnings.push({
      code: "BENCHMARK_MISSING",
      message: `Khong tim thay benchmark ${benchmarkSymbol} trong cua so du lieu hien tai.`
    });
  }

  if (freshRows.length < LIMITED_UNIVERSE_THRESHOLD) {
    warnings.push({
      code: "LIMITED_UNIVERSE",
      message: `Universe du lieu con ${freshRows.length} ma tuoi trong cua so ${freshnessDates.length} phien.`
    });
  }

  if (staleCount > 0) {
    warnings.push({
      code: "STALE_SYMBOLS_EXCLUDED",
      message: `${staleCount} ma bi loai khoi ket qua vi dong du lieu moi nhat da cu hon cua so freshness.`
    });
  }

  if (!req1Rows.length) {
    warnings.push({
      code: "REQ1_EMPTY",
      message: "Bo loc 1 hien khong co ma nao dat dieu kien."
    });
  }

  if (!req2Rows.length) {
    warnings.push({
      code: "REQ2_EMPTY",
      message: "Bo loc 2 hien khong co ma nao dat dieu kien."
    });
  }

  return {
    req1Rows,
    req2Rows,
    warnings,
    meta: {
      universeSize: snapshotRows.length,
      eligibleUniverseSize: freshRows.length,
      staleUniverseSize: staleCount,
      benchmarkSymbol,
      benchmarkAvailable,
      freshnessWindowSessions: freshnessDates.length,
      dataDate
    }
  };
}
