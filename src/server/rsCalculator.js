const INDEX_SYMBOLS = new Set(["VNINDEX", "HNXINDEX"]);

function toNullableNumber(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function averageNumbers(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) {
    return null;
  }

  const sum = validValues.reduce((total, value) => total + value, 0);
  return Number((sum / validValues.length).toFixed(2));
}

function compareDateDescending(left, right) {
  return String(right?.date || "").localeCompare(String(left?.date || ""));
}

function normalizeHistoryRow(row) {
  return {
    date: row?.date || null,
    symbol: row?.symbol || null,
    close: toNullableNumber(row?.close),
    volume: toNullableNumber(row?.volume),
    high_tb4d: toNullableNumber(row?.high_tb4d),
    vol_tb10d: toNullableNumber(row?.vol_tb10d),
    roc26: toNullableNumber(row?.roc26),
    ma20: toNullableNumber(row?.ma20),
    ma50: toNullableNumber(row?.ma50),
    ma50_tb5d: toNullableNumber(row?.ma50_tb5d),
    roc_ts: toNullableNumber(row?.roc_ts)
  };
}

export function buildPercentileRankMaps(historyRows) {
  const rowsByDate = new Map();

  for (const rawRow of historyRows) {
    const row = normalizeHistoryRow(rawRow);
    if (!row.date || !row.symbol || INDEX_SYMBOLS.has(row.symbol) || row.roc_ts === null) {
      continue;
    }

    if (!rowsByDate.has(row.date)) {
      rowsByDate.set(row.date, []);
    }

    rowsByDate.get(row.date).push({ symbol: row.symbol, roc_ts: row.roc_ts });
  }

  const rankMaps = new Map();

  for (const [date, entries] of rowsByDate.entries()) {
    entries.sort((left, right) => {
      if (left.roc_ts !== right.roc_ts) {
        return left.roc_ts - right.roc_ts;
      }

      return left.symbol.localeCompare(right.symbol);
    });

    const dateRanks = new Map();
    const lastIndex = entries.length - 1;

    entries.forEach((entry, index) => {
      const percentile = lastIndex <= 0 ? 100 : Number(((index / lastIndex) * 100).toFixed(2));
      dateRanks.set(entry.symbol, percentile);
    });

    rankMaps.set(date, dateRanks);
  }

  return rankMaps;
}

export function buildSnapshotWithRs(latestRows, historyRows, options = {}) {
  const freshDates = new Set(options.freshnessDates || []);
  const rankMaps = buildPercentileRankMaps(historyRows);
  const historyBySymbol = new Map();

  for (const rawRow of historyRows) {
    const row = normalizeHistoryRow(rawRow);
    if (!row.symbol || !row.date) {
      continue;
    }

    if (!historyBySymbol.has(row.symbol)) {
      historyBySymbol.set(row.symbol, []);
    }

    historyBySymbol.get(row.symbol).push(row);
  }

  for (const rows of historyBySymbol.values()) {
    rows.sort(compareDateDescending);
  }

  return latestRows.map((rawRow) => {
    const baseRow = normalizeHistoryRow(rawRow);
    const symbolHistory = historyBySymbol.get(baseRow.symbol) || [];
    const latestThreeRows = symbolHistory.slice(0, 3);
    const rsValues = latestThreeRows.map((historyRow) => {
      return rankMaps.get(historyRow.date)?.get(baseRow.symbol) ?? null;
    });

    return {
      ...baseRow,
      rs1: rsValues[0] ?? null,
      rs2: rsValues[1] ?? null,
      rs3: rsValues[2] ?? null,
      rs_avg: averageNumbers(rsValues),
      history_dates: latestThreeRows.map((row) => row.date),
      latest_date: baseRow.date,
      isFresh: !freshDates.size || freshDates.has(baseRow.date)
    };
  });
}
