#!/usr/bin/env node
import { initDuckDb, storageStatus, writeCandlesParquet } from '@hyperlocal/storage';
import type { Candle } from '@hyperlocal/types';

const [, , cmd] = process.argv;

async function seedSample() {
  const now = Date.now();
  const rows: Candle[] = Array.from({ length: 180 }, (_, i) => {
    const t = now - (179 - i) * 60_000;
    const o = 50000 + Math.sin(i/10)*20;
    return {
      src: 'hyperliquid',
      coin: 'BTC',
      interval: '1m',
      openTime: t,
      closeTime: t + 60_000 - 1,
      open: o, high: o + 5, low: o - 5, close: o + 1,
      volume: 1.23, tradeCount: 10, vwap: o + 0.1
    };
  });
  const files = await writeCandlesParquet(rows);
  console.log(`Seeded ${rows.length} candles into ${files.length} parquet file(s).`);
}

async function verify() {
  const st = await storageStatus();
  console.log(JSON.stringify(st, null, 2));
  if (st.candles_rows <= 0) process.exitCode = 1;
}

async function main() {
  switch (cmd) {
    case 'db:init':
      await initDuckDb();
      console.log('DuckDB initialized and Parquet views created.');
      break;
    case 'storage:seed':
      await seedSample();
      break;
    case 'storage:verify':
      await verify();
      break;
    default:
      console.log(`Usage:
  hyperlocal db:init          # initialize DuckDB + views
  hyperlocal storage:seed     # write sample BTC 1m candles to Parquet
  hyperlocal storage:verify   # show status (files + row counts)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

