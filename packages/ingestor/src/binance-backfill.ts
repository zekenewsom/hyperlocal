import { writeCandlesParquet, getDb } from '@hyperlocal/storage';
import { TokenBucket } from './ratelimit.js';
import { loadConfig, log } from '@hyperlocal/core';
import type { Interval } from '@hyperlocal/types';

// Configurable Binance REST base (no key needed for klines)

function intervalMs(i: Interval): number {
  switch (i) {
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1d': return 86_400_000;
  }
}

export type BackfillProgress = {
  source: 'binance';
  coin: string; interval: Interval;
  windowsPlanned: number; windowsDone: number; rows: number;
};

export class BinanceBackfill {
  // Be conservative vs exchange limits; klines weight ~1 per req
  private weightBucket = new TokenBucket(600, 600/60); // default 600 req/min; updated from config at runtime
  private progress = new Map<string, BackfillProgress>();

  // Simple symbol mapper: map coin (e.g., BTC) to USDT pair (e.g., BTCUSDT)
  private toBinanceSymbol(coin: string): string { return `${coin}USDT`; }

  async runHistoricalBackfill(nowMs = Date.now()) {
    const cfg = loadConfig();
    if (!cfg.binance?.enabled) {
      log.info({ component: 'ingestor', step: 'binance_skip' }, 'Binance backfill disabled');
      return;
    }
    // Reconfigure token bucket from config
    this.weightBucket = new TokenBucket(cfg.binance.weight_per_min, cfg.binance.weight_per_min/60);
    const db = getDb().connect();
    try {
      for (const coin of cfg.universe) {
        for (const interval of cfg.intervals as Interval[]) {
          const key = `${coin}:${interval}`;
          this.progress.set(key, { source: 'binance', coin, interval, windowsPlanned: 0, windowsDone: 0, rows: 0 });

          // Determine boundary to backfill up to (older than existing lake)
          const q = `SELECT min(open_time) as mino FROM candles_pq_ordered WHERE coin='${coin}' AND interval='${interval}' AND src='hyperliquid'`;
          const r = await new Promise<any[]>((res, rej)=> db.all(q, (e: any, rows: any[])=> e?rej(e):res(rows)));
          const mino = r?.[0]?.mino;
          if (!mino) {
            // We only extend older than HL. If no HL data yet, skip; HL backfill should run first.
            log.info({ component: 'ingestor', step: 'binance_skip_no_hl', coin, interval }, 'Skipping Binance: no HL baseline yet');
            continue;
          }
          let endTime = new Date(mino).getTime() - 1;

          if (endTime <= 0) continue; // nothing to do

          const intMs = intervalMs(interval);
          const maxPerReq = 1000; // Binance klines limit
          const step = intMs * maxPerReq - 1;
          const windows: Array<[number, number]> = [];

          // Build backward windows until we hit 0 or exchange returns empty
          // Plan a conservative number of windows; will truncate if exchange returns empty sooner
          // Start from endTime and move backward
          let curEnd = endTime;
          for (let w = 0; w < 10_000 && curEnd > 0; w++) {
            const s = Math.max(0, curEnd - step);
            windows.push([s, curEnd]);
            curEnd = s - 1;
          }
          this.progress.get(key)!.windowsPlanned = windows.length;

          const symbol = this.toBinanceSymbol(coin);
          let stopEarly = false;
          for (const [s, e] of windows) {
            if (stopEarly) break;
            // rate limit
            while (!this.weightBucket.take(1)) await new Promise(r => setTimeout(r, 100));

            const params = new URLSearchParams({
              symbol,
              interval,
              startTime: String(s),
              endTime: String(e),
              limit: String(maxPerReq)
            });
            const base = cfg.binance.base_url || 'https://api.binance.us';
            const url = `${base}/api/v3/klines?${params.toString()}`;
            const resp = await fetch(url, { method: 'GET' });
            if (!resp.ok) throw new Error(`binance klines failed ${resp.status}`);
            const data: any[] = await resp.json();
            if (!Array.isArray(data) || data.length === 0) {
              log.info({ component: 'ingestor', step: 'binance_empty', coin, interval, s, e }, 'Binance returned empty window');
              stopEarly = true;
              break;
            }

            // Binance kline array format:
            // [ openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBase, takerBuyQuote, ignore ]
            const rows = data.map(d => ({
              t: Number(d[0] ?? 0),
              T: Number(d[6] ?? 0),
              s: coin,
              i: interval,
              o: Number(d[1] ?? 0),
              h: Number(d[2] ?? 0),
              l: Number(d[3] ?? 0),
              c: Number(d[4] ?? 0),
              v: Number(d[5] ?? 0),
              n: Number(d[8] ?? 0)
            }));

            // Convert to internal Candle and write
            const candles = rows.map((w) => ({
              src: 'binance' as const,
              coin: w.s,
              interval: w.i as Interval,
              openTime: w.t,
              closeTime: w.T,
              open: w.o,
              high: w.h,
              low: w.l,
              close: w.c,
              volume: w.v,
              tradeCount: w.n,
              vwap: undefined
            }));
            log.info({ component: 'ingestor', step: 'binance_write', coin, interval, s, e, rows: candles.length }, 'Writing Binance candles');
            await writeCandlesParquet(candles);
            const p = this.progress.get(key)!;
            p.windowsDone += 1; p.rows += rows.length;

            // If fewer than maxPerReq, we likely hit the start of history for this symbol
            if (data.length < maxPerReq) {
              log.info({ component: 'ingestor', step: 'binance_done_symbol', coin, interval, windows: p.windowsDone, rows: p.rows }, 'Reached start of Binance history');
              stopEarly = true;
            }
          }
        }
      }
    } finally {
      db.close();
    }
  }

  getProgress(): BackfillProgress[] {
    return Array.from(this.progress.values());
  }
}
