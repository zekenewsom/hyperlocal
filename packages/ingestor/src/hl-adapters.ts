import type { Candle, Trade, L2Book, Bbo } from '@hyperlocal/types';

export type WsIn =
  | { channel: "subscriptionResponse"; data: any }
  | { channel: "trades"; data: WsTrade[] }
  | { channel: "l2Book"; data: WsBook }
  | { channel: "bbo"; data: WsBbo }
  | { channel: "candle"; data: WsCandle[] }
  | { channel: "pong" }
  | { channel: string; data?: any };

export interface WsCandle {
  t: number; T: number; s: string; i: string;
  o: number; c: number; h: number; l: number; v: number; n: number;
}
export interface WsTrade {
  coin: string; side: string; px: string; sz: string; hash: string; time: number; tid: number; users: [string, string];
}
export interface WsLevel { px: string; sz: string; n: number; }
export interface WsBook {
  coin: string;
  levels: [Array<WsLevel>, Array<WsLevel>];
  time: number;
}
export interface WsBbo {
  coin: string;
  time: number;
  bbo: [WsLevel | null, WsLevel | null];
}

export function toCandle(w: WsCandle): Candle {
  return {
    src: 'hyperliquid',
    coin: w.s,
    interval: w.i as Candle['interval'],
    openTime: w.t,
    closeTime: w.T,
    open: Number(w.o),
    high: Number(w.h),
    low: Number(w.l),
    close: Number(w.c),
    volume: Number(w.v),
    tradeCount: Number(w.n),
    vwap: undefined
  };
}
export function toTrade(w: WsTrade): Trade {
  return {
    src: 'hyperliquid',
    coin: w.coin,
    ts: w.time,
    price: Number(w.px),
    size: Number(w.sz),
    side: w.side === 'B' ? 'buy' : w.side === 'S' ? 'sell' : 'undetermined',
  };
}
export function toBook(w: WsBook): L2Book {
  const [bids, asks] = w.levels;
  const map = (lv: WsLevel[]) => lv.map(l => ({ price: Number(l.px), size: Number(l.sz) }));
  return { src: 'hyperliquid', coin: w.coin, ts: w.time, bids: map(bids), asks: map(asks) };
}
export function toBbo(w: WsBbo): Bbo {
  const [bid, ask] = w.bbo;
  return {
    coin: w.coin,
    ts: w.time,
    bidPrice: bid ? Number(bid.px) : NaN,
    bidSize: bid ? Number(bid.sz) : 0,
    askPrice: ask ? Number(ask.px) : NaN,
    askSize: ask ? Number(ask.sz) : 0
  };
}

