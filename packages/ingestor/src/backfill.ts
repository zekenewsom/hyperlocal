import { writeCandlesParquet, getDb } from '@hyperlocal/storage';
import { toCandle, type WsCandle } from './hl-adapters.js';
import { TokenBucket, minMs } from './ratelimit.js';
import { loadConfig } from '@hyperlocal/core';
import type { Interval } from '@hyperlocal/types';

function intervalMs(i: Interval): number {
  switch(i){
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1d': return 86_400_000;
  }
}

export type BackfillProgress = {
  source: 'hyperliquid';
  coin: string; interval: Interval;
  windowsPlanned: number; windowsDone: number; rows: number;
};

export class CandleBackfill {
  // REST: 1200 weight/min. candleSnapshot has weight 20 + (items/60).
  private weightBucket = new TokenBucket(1200, 1200/60);
  private progress = new Map<string, BackfillProgress>();

  async runStartupBackfill(nowMs = Date.now()) {
    const cfg = loadConfig();
    const db = getDb().connect();
    try {
      for (const coin of cfg.universe) {
        for (const interval of cfg.intervals as Interval[]) {
          const key = `${coin}:${interval}`;
          this.progress.set(key, { source: 'hyperliquid', coin, interval, windowsPlanned: 0, windowsDone: 0, rows: 0 });

          // find last close_time; if none, start = now - lookback_days
          const q = `SELECT max(close_time) as maxc FROM candles_pq_ordered WHERE coin='${coin}' AND interval='${interval}'`;
          let startTime = nowMs - cfg.backfill.lookback_days * 86_400_000;
          const r = await new Promise<any[]>((res, rej)=> db.all(q, (e: any, rows: any[])=> e?rej(e):res(rows)));
          const maxc = r?.[0]?.maxc;
          if (maxc) startTime = new Date(maxc).getTime() + 1;

          const endTime = nowMs;
          const intMs = intervalMs(interval);
          const maxBars = cfg.backfill.window_candles; // 3000 by default
          const step = intMs * maxBars - 1;

          const windows: Array<[number,number]> = [];
          for (let s = startTime; s <= endTime; s = Math.min(endTime, s + step) + 1) {
            const e = Math.min(endTime, s + step);
            windows.push([s,e]);
          }
          this.progress.get(key)!.windowsPlanned = windows.length;

          // concurrency (2 default)
          const concurrency = Math.max(1, Math.min(8, cfg.backfill.max_concurrency));
          let idx = 0;
          const worker = async () => {
            while (idx < windows.length) {
              const my = idx++; const w = windows[my]!; const [s,e] = w;
              const items = Math.ceil((e - s + 1) / intMs);
              const weight = 20 + Math.ceil(items / 60); // HL weight model for candles
              // wait for tokens
              while (!this.weightBucket.take(weight)) await new Promise(r => setTimeout(r, 100));
              const rows = await this.fetchCandleSnapshot(coin, interval, s, e);
              const candles = rows.map(toCandle);
              await writeCandlesParquet(candles);
              const p = this.progress.get(key)!;
              p.windowsDone += 1; p.rows += rows.length;
            }
          };
          await Promise.all(Array.from({length: concurrency}, () => worker()));
        }
      }
    } finally {
      db.close();
    }
  }

  async fetchCandleSnapshot(coin: string, interval: Interval, startTime: number, endTime: number): Promise<WsCandle[]> {
    // Helper to normalize various API response shapes
    const normalize = (raw: any): WsCandle[] => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return arr.map((d: any) => ({
        t: Number(d.t ?? (d.T ? Number(d.T) - minMs(1) : 0)),
        T: Number(d.T ?? d.t ?? 0),
        s: String(d.s ?? coin),
        i: String(d.i ?? interval),
        o: Number(d.o ?? d.open ?? d.O ?? 0),
        c: Number(d.c ?? d.close ?? d.C ?? 0),
        h: Number(d.h ?? d.high ?? d.H ?? 0),
        l: Number(d.l ?? d.low ?? d.L ?? 0),
        v: Number(d.v ?? d.volume ?? d.V ?? 0),
        n: Number(d.n ?? d.tradeCount ?? 0)
      }));
    };

    // Try ms first (spec intent), then fallback to seconds if empty
    const attempt = async (s: number, e: number) => {
      const body = { type: 'candleSnapshot', req: { coin, interval, startTime: s, endTime: e } };
      const r = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(`candleSnapshot failed ${r.status}`);
      const data = await r.json();
      return normalize(data);
    };

    let rows = await attempt(startTime, endTime);
    if (rows.length === 0) {
      // Fallback: some environments/APIs expect epoch seconds
      rows = await attempt(Math.floor(startTime / 1000), Math.floor(endTime / 1000));
    }
    return rows;
  }

  getProgress(): BackfillProgress[] {
    return Array.from(this.progress.values());
  }
}
