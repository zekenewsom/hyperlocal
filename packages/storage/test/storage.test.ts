import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { writeCandlesParquet, storageStatus, initDuckDb, parquetRoot } from '../src/index.js';

const now = Date.now();

function mkCandle(t: number) {
  const o = 50000 + Math.sin(t/60000)*10;
  return {
    src: 'hyperliquid' as const,
    coin: 'BTC',
    interval: '1m' as const,
    openTime: t,
    closeTime: t + 60_000 - 1,
    open: o, high: o+5, low: o-5, close: o+1,
    volume: 1.23, tradeCount: 10, vwap: o+0.1
  };
}

describe('storage parquet + duckdb', () => {
  it('writes partitioned parquet and exposes via duckdb view', async () => {
    // seed 90 minutes synthetic data
    const rows = Array.from({length: 90}, (_, i) => mkCandle(now - (89-i)*60_000));
    const files = await writeCandlesParquet(rows);
    expect(files.length).toBeGreaterThan(0);
    // init db & views
    await initDuckDb();
    const st = await storageStatus();
    expect(st.parquet_files).toBeGreaterThan(0);
    expect(st.candles_rows).toBeGreaterThanOrEqual(90);
    // ensure files live under parquet/BTC/1m/date=YYYY-MM-DD
    const root = parquetRoot();
    const found = files.every(f => f.startsWith(path.join(root, 'BTC', '1m')));
    expect(found).toBe(true);
  });
});

