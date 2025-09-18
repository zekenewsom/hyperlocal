import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { ParquetWriter, ParquetSchema } from 'parquets';
import type { Candle } from '@hyperlocal/types';
import { dirFor } from './layout.js';

const candleSchema = new ParquetSchema({
  src:            { type: 'UTF8' },
  coin:           { type: 'UTF8' },
  interval:       { type: 'UTF8' },
  open_time:      { type: 'INT64' }, // epoch ms
  close_time:     { type: 'INT64' },
  open:           { type: 'DOUBLE' },
  high:           { type: 'DOUBLE' },
  low:            { type: 'DOUBLE' },
  close:          { type: 'DOUBLE' },
  volume:         { type: 'DOUBLE' },
  trade_count:    { type: 'INT64', optional: true },
  vwap:           { type: 'DOUBLE', optional: true },
  // convenience for Hive-partition date=YYYY-MM-DD
  date:           { type: 'UTF8' }
});

// UTC YYYY-MM-DD
function ymdUTC(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function groupByDay(rows: Candle[]): Record<string, Candle[]> {
  const g: Record<string, Candle[]> = {};
  for (const r of rows) {
    const key = ymdUTC(r.openTime);
    (g[key] ||= []).push(r);
  }
  return g;
}

/**
 * Write candles into partitioned Parquet files.
 * Path: parquet/{coin}/{interval}/date=YYYY-MM-DD/*.parquet
 * Returns list of file paths written.
 */
export async function writeCandlesParquet(rows: Candle[]): Promise<string[]> {
  if (rows.length === 0) return [];
  // validate homogeneous coin/interval for chunking simplicity
  const coin = rows[0]!.coin, interval = rows[0]!.interval;
  if (!rows.every(r => r.coin === coin && r.interval === interval)) {
    throw new Error('writeCandlesParquet expects homogeneous {coin,interval}');
  }
  const byDay = groupByDay(rows);
  const outFiles: string[] = [];

  for (const [date, dayRows] of Object.entries(byDay)) {
    // day-specific directory
    const dir = dirFor(coin, interval, date);
    fs.mkdirSync(dir, { recursive: true });
    if (dayRows.length === 0) continue;
    const first = dayRows[0]!.openTime, last = dayRows[dayRows.length - 1]!.openTime;
    const file = path.join(dir, `chunk-${first}-${last}-${uuidv4()}.parquet`);

    const writer = await ParquetWriter.openFile(candleSchema, file);
    for (const r of dayRows) {
      await writer.appendRow({
        src: 'hyperliquid',
        coin,
        interval,
        open_time: r.openTime,
        close_time: r.closeTime,
        open: r.open, high: r.high, low: r.low, close: r.close,
        volume: r.volume,
        trade_count: r.tradeCount ?? null,
        vwap: r.vwap ?? null,
        date
      });
    }
    await writer.close();
    outFiles.push(file);
  }
  return outFiles;
}
