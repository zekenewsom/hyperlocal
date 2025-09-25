import { loadConfig, log } from '@hyperlocal/core';
import { HlWsClient } from './ws-client.js';
import { CandleBackfill } from './backfill.js';
import { BinanceBackfill } from './binance-backfill.js';
import { toBbo, toBook, toCandle, toTrade, type WsIn } from './hl-adapters.js';
import { featureEngine } from '@hyperlocal/analytics';
import type { Interval } from '@hyperlocal/types';

export type IngestorStatus = {
  running: boolean;
  ws: ReturnType<HlWsClient['getStats']>;
  backfill: ReturnType<CandleBackfill['getProgress']>;
  msgs: { candles: number; trades: number; books: number; bbo: number; pong: number; subAcks: number; };
  lastMessageTimestamp?: number;
};

class Ingestor {
  private ws?: HlWsClient;
  private backfill = new CandleBackfill();
  private binance = new BinanceBackfill();
  private lastCandleTimestamps = new Map<string, number>();
  private gapsInProgress = new Set<string>();
  private gapScanTimer?: ReturnType<typeof setInterval>;
  private gapScanRunning = false;
  private status: IngestorStatus = {
    running: false,
    ws: { url: '', connected: false, outboundMsgs: 0, subs: 0 },
    backfill: [],
    msgs: { candles: 0, trades: 0, books: 0, bbo: 0, pong: 0, subAcks: 0 }
  };

  async start() {
    if (this.status.running) return;
    const cfg = loadConfig();
    // 1) Hyperliquid backfill first
    log.info({ component: 'ingestor', step: 'backfill_start' }, 'Starting Hyperliquid backfill');
    await this.backfill.runStartupBackfill();
    log.info({ component: 'ingestor', step: 'backfill_done' }, 'Backfill complete');

    // Scan recent history for any internal gaps and fill them
    try {
      await this.scanAndFillGaps();
    } catch (e) {
      log.warn({ component: 'ingestor', err: String(e) }, 'Gap scan/fill failed');
    }

    // 2) Warm up feature engine with recent Hyperliquid candles so RSI/EWvol, etc., are stabilized
    log.info({ component: 'ingestor', step: 'warmup_start' }, 'Warming up feature engine');
    await featureEngine.warmup(1000);
    log.info({ component: 'ingestor', step: 'warmup_done' }, 'Warmup complete');

    // 3) Binance historical (older), after HL to avoid interference
    log.info({ component: 'ingestor', step: 'binance_start' }, 'Starting Binance backfill');
    await this.binance.runHistoricalBackfill();
    log.info({ component: 'ingestor', step: 'binance_done' }, 'Binance backfill complete');

    // Populate last timestamps after backfills
    try {
      const m: any = await import('@hyperlocal/storage');
      this.lastCandleTimestamps = await (m.getLastCandleTimestamps?.() ?? new Map());
      log.info({ component: 'ingestor', count: this.lastCandleTimestamps.size }, 'Populated last candle timestamps');
    } catch (e) {
      log.warn({ component: 'ingestor', err: String(e) }, 'Could not populate last candle timestamps');
    }

    // 4) WS live
    const onMessage = (raw: any) => this.onWsMessage(raw);
    const onEvent = (e: any) => { if (e.t === 'pong') this.status.msgs.pong++; };
    this.ws = new HlWsClient(cfg.ws.url, cfg.ws.heartbeat_sec, onMessage, onEvent);
    this.ws.connect();
    this.status.running = true;
    featureEngine.start();

    // Subscribe per config
    for (const coin of cfg.universe) {
      for (const i of cfg.intervals as Interval[]) {
        this.ws.subscribe({ type:'candle', coin, interval: i });
      }
      this.ws.subscribe({ type:'trades', coin });
      this.ws.subscribe({ type:'l2Book', coin });
      // Optional BBO
      this.ws.subscribe({ type:'bbo', coin });
    }
    this.status.ws = this.ws.getStats();

    // Periodic gap scan while running (every 15 minutes)
    this.gapScanTimer = setInterval(() => {
      if (!this.status.running || this.gapScanRunning) return;
      this.gapScanRunning = true;
      this.scanAndFillGaps().finally(() => { this.gapScanRunning = false; });
    }, 15 * 60 * 1000);
  }

  async stop() {
    this.status.running = false;
    featureEngine.stop();
    if (this.gapScanTimer) { clearInterval(this.gapScanTimer); this.gapScanTimer = undefined; }
  }

  private onWsMessage(raw: any) {
    this.status.lastMessageTimestamp = Date.now();
    const msg = raw as WsIn;
    const intervalToMs = (i: Interval): number => {
      switch(i){
        case '1m': return 60_000;
        case '5m': return 300_000;
        case '15m': return 900_000;
        case '1h': return 3_600_000;
        case '4h': return 14_400_000;
        case '1d': return 86_400_000;
        default: return 0;
      }
    };
    if (msg.channel === 'pong') {
      this.ws?.markPong();
      this.status.msgs.pong++;
      return;
    }
    if (msg.channel === 'subscriptionResponse') {
      this.status.msgs.subAcks++;
      return;
    }
    if (msg.channel === 'candle') {
      const arr = Array.isArray(msg.data) ? msg.data : [];
      for (const w of arr) {
        const c = toCandle(w);
        const key = `${c.coin}:${c.interval}`;
        const lastTs = this.lastCandleTimestamps.get(key);
        const intMs = intervalToMs(c.interval as Interval);
        if (lastTs && intMs > 0) {
          const diff = c.openTime - lastTs;
          if (diff > intMs && !this.gapsInProgress.has(key)) {
            const gapStart = lastTs + intMs;
            const gapEnd = c.openTime - 1;
            log.warn({ component: 'ingestor', key, gapStart, gapEnd }, 'Gap detected, attempting to fill');
            this.gapsInProgress.add(key);
            this.backfill.fillGap(c.coin, c.interval as Interval, gapStart, gapEnd)
              .finally(() => this.gapsInProgress.delete(key));
          }
        }
        this.lastCandleTimestamps.set(key, c.openTime);
        featureEngine.onCandle(c);
      }
      this.status.msgs.candles += arr.length;
      return;
    }
    if (msg.channel === 'trades') {
      const arr = Array.isArray(msg.data) ? msg.data : [];
      arr.map((w)=> featureEngine.onTrade(toTrade(w)));
      this.status.msgs.trades += arr.length;
      return;
    }
    if (msg.channel === 'l2Book') {
      const b = toBook(msg.data);
      featureEngine.onBook(b);
      this.status.msgs.books += 1;
      return;
    }
    if (msg.channel === 'bbo') {
      const b = toBbo(msg.data);
      featureEngine.onBbo(b);
      this.status.msgs.bbo += 1;
      return;
    }
  }

  private async scanAndFillGaps(sinceMs?: number) {
    const now = Date.now();
    const cfg = loadConfig();
    const lookbackMs = (cfg.backfill?.lookback_days ?? 7) * 86_400_000;
    const since = sinceMs ?? (now - lookbackMs);
    const intervalToMs = (i: Interval): number => {
      switch(i){
        case '1m': return 60_000;
        case '5m': return 300_000;
        case '15m': return 900_000;
        case '1h': return 3_600_000;
        case '4h': return 14_400_000;
        case '1d': return 86_400_000;
        default: return 0;
      }
    };
    try {
      const m: any = await import('@hyperlocal/storage');
      const gaps: Array<{ coin: string; interval: Interval; gap_start: number; gap_end: number; bars_missing: number }>
        = await (m.findHyperliquidGaps?.(since) ?? []);
      if (!Array.isArray(gaps) || gaps.length === 0) return;
      log.info({ component: 'ingestor', gaps: gaps.length }, 'Detected gaps; filling');
      // Fill sequentially to respect weights
      for (const g of gaps) {
        const intMs = intervalToMs(g.interval);
        if (!intMs) continue;
        let s = g.gap_start;
        const e = g.gap_end;
        // Split into chunks aligned to HL window size similar to startup
        const maxBars = cfg.backfill?.window_candles ?? 3000;
        const step = intMs * maxBars - 1;
        while (s <= e) {
          const chunkEnd = Math.min(e, s + step);
          await this.backfill.fillGap(g.coin, g.interval, s, chunkEnd);
          s = chunkEnd + 1;
        }
      }
    } catch (e) {
      log.warn({ component: 'ingestor', err: String(e) }, 'Error during scanAndFillGaps');
    }
  }

  async fillGapsNow(sinceMs?: number) {
    await this.scanAndFillGaps(sinceMs);
    return { ok: true } as const;
  }

  getStatus(): IngestorStatus {
    if (this.ws) this.status.ws = this.ws.getStats();
    // Combine progress: Hyperliquid first, then Binance
    this.status.backfill = [...this.backfill.getProgress(), ...this.binance.getProgress()];
    return this.status;
  }
}

// Singleton for the server (used by API routes)
const g = (globalThis as any);
if (!g.__INGESTOR_SINGLETON__) g.__INGESTOR_SINGLETON__ = new Ingestor();
export const ingestor = g.__INGESTOR_SINGLETON__ as Ingestor;
