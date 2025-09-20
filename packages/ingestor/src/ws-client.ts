import WebSocket from 'ws';
import { TokenBucket, secMs } from './ratelimit.js';

type Sub = { type: 'candle'|'trades'|'l2Book'|'bbo'; coin: string; interval?: string };

export type WsStats = {
  url: string;
  connected: boolean;
  lastOpen?: number;
  lastClose?: number;
  lastPing?: number;
  lastPong?: number;
  outboundMsgs: number;
  subs: number;
};

export class HlWsClient {
  private ws?: WebSocket;
  private heartbeatTimer?: NodeJS.Timeout;
  private lastOutbound = 0;
  private stats: WsStats;
  private sendLimiter = new TokenBucket(2000, 2000/60); // 2000 msgs/min
  private subs = new Set<string>();
  constructor(
    private url: string,
    private heartbeatSec: number,
    private onMessage: (raw: any) => void,
    private onEvent?: (e: { t: string; info?: any }) => void
  ) {
    this.stats = { url, connected: false, outboundMsgs: 0, subs: 0 };
  }

  private keyOf(s: Sub) {
    return s.type === 'candle' ? `${s.type}:${s.coin}:${s.interval}` : `${s.type}:${s.coin}`;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.ws = new WebSocket(this.url);
    this.ws.on('open', () => {
      this.stats.connected = true;
      this.stats.lastOpen = Date.now();
      this.onEvent?.({ t: 'ws_connected' });
      this.startHeartbeat();
      // Re-subscribe existing
      for (const k of this.subs) {
        const [type, coin, interval] = k.split(':') as [string, string, string?];
        if (type === 'candle') this.subscribe({ type: 'candle', coin, interval: interval! });
        else if (type === 'trades') this.subscribe({ type: 'trades', coin });
        else if (type === 'l2Book') this.subscribe({ type: 'l2Book', coin });
        else if (type === 'bbo') this.subscribe({ type: 'bbo', coin });
      }
    });
    this.ws.on('message', (data) => {
      try { this.onMessage(JSON.parse(String(data))); } catch {}
    });
    this.ws.on('close', () => {
      this.stats.connected = false;
      this.stats.lastClose = Date.now();
      this.onEvent?.({ t: 'ws_disconnected' });
      this.stopHeartbeat();
      setTimeout(() => this.connect(), secMs(1 + Math.floor(Math.random()*3))); // jittered backoff
    });
    this.ws.on('error', () => {/* handled by close*/});
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const idle = Date.now() - this.lastOutbound;
      if (idle >= this.heartbeatSec * 1000) {
        this.ping();
      }
    }, 1000);
  }
  private stopHeartbeat() { if (this.heartbeatTimer) clearInterval(this.heartbeatTimer); }

  private send(obj: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    if (!this.sendLimiter.take(1)) return false;
    this.ws.send(JSON.stringify(obj));
    this.lastOutbound = Date.now();
    this.stats.outboundMsgs++;
    return true;
  }

  ping() {
    if (this.send({ method: 'ping' })) {
      this.stats.lastPing = Date.now();
      this.onEvent?.({ t: 'ping' });
    }
  }

  markPong() {
    this.stats.lastPong = Date.now();
    this.onEvent?.({ t: 'pong' });
  }

  subscribe(s: Sub) {
    const key = this.keyOf(s);
    if (this.subs.has(key)) return;
    const payload = s.type === 'candle'
      ? { method: 'subscribe', subscription: { type:'candle', coin: s.coin, interval: s.interval } }
      : s.type === 'trades'
      ? { method: 'subscribe', subscription: { type:'trades', coin: s.coin } }
      : s.type === 'l2Book'
      ? { method: 'subscribe', subscription: { type:'l2Book', coin: s.coin } }
      : { method: 'subscribe', subscription: { type:'bbo', coin: s.coin } };
    if (this.send(payload)) {
      this.subs.add(key);
      this.stats.subs = this.subs.size;
      this.onEvent?.({ t: 'subscribed', info: s });
    }
  }

  unsubscribe(s: Sub) {
    const key = this.keyOf(s);
    if (!this.subs.has(key)) return;
    const payload = s.type === 'candle'
      ? { method: 'unsubscribe', subscription: { type:'candle', coin: s.coin, interval: s.interval } }
      : s.type === 'trades'
      ? { method: 'unsubscribe', subscription: { type:'trades', coin: s.coin } }
      : s.type === 'l2Book'
      ? { method: 'unsubscribe', subscription: { type:'l2Book', coin: s.coin } }
      : { method: 'unsubscribe', subscription: { type:'bbo', coin: s.coin } };
    if (this.send(payload)) {
      this.subs.delete(key);
      this.stats.subs = this.subs.size;
      this.onEvent?.({ t: 'unsubscribed', info: s });
    }
  }

  getStats(): WsStats { return { ...this.stats }; }
}
