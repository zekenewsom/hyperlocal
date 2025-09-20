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
};

class Ingestor {
  private ws?: HlWsClient;
  private backfill = new CandleBackfill();
  private binance = new BinanceBackfill();
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

    // 2) Warm up feature engine with recent Hyperliquid candles so RSI/EWvol, etc., are stabilized
    log.info({ component: 'ingestor', step: 'warmup_start' }, 'Warming up feature engine');
    await featureEngine.warmup(1000);
    log.info({ component: 'ingestor', step: 'warmup_done' }, 'Warmup complete');

    // 3) Binance historical (older), after HL to avoid interference
    log.info({ component: 'ingestor', step: 'binance_start' }, 'Starting Binance backfill');
    await this.binance.runHistoricalBackfill();
    log.info({ component: 'ingestor', step: 'binance_done' }, 'Binance backfill complete');

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
  }

  async stop() {
    this.status.running = false;
    featureEngine.stop();
  }

  private onWsMessage(raw: any) {
    const msg = raw as WsIn;
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
      arr.map((w)=> {
        const c = toCandle(w);
        featureEngine.onCandle(c);
      });
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
