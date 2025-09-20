export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export interface Candle {
    src: 'hyperliquid';
    coin: string;
    interval: Interval;
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    tradeCount?: number;
    vwap?: number;
}
export interface Trade {
    src: 'hyperliquid';
    coin: string;
    ts: number;
    price: number;
    size: number;
    side: 'buy' | 'sell' | 'undetermined';
}
export interface BookLevel {
    price: number;
    size: number;
}
export interface L2Book {
    src: 'hyperliquid';
    coin: string;
    ts: number;
    bids: BookLevel[];
    asks: BookLevel[];
}
export interface Bbo {
    coin: string;
    ts: number;
    bidPrice: number;
    bidSize: number;
    askPrice: number;
    askSize: number;
}
export interface RateBudget {
    minuteWindow: {
        maxMsgs: number;
        used: number;
        remaining: number;
    };
    wsConns: {
        max: number;
        used: number;
    };
    subs: {
        max: number;
        used: number;
    };
    rest: {
        throttleQps: number;
        tokens: number;
        capacity: number;
    };
}
