import { type AppConfig } from '@hyperlocal/core';
export declare function getCfg(): AppConfig;
export declare function storageRoot(cfg?: {
    universe: string[];
    intervals: ["1m" | "5m" | "15m" | "1h" | "4h" | "1d", ...("1m" | "5m" | "15m" | "1h" | "4h" | "1d")[]];
    storage_root: string;
    retention: {
        candles_days: number;
    };
    ui: {
        theme: "dark" | "light";
        timezone: string;
    };
    ws: {
        url: string;
        heartbeat_sec: number;
    };
    backfill: {
        lookback_days: number;
        window_candles: number;
        max_concurrency: number;
    };
    signals: {
        presets: string[];
        scoring: {
            combine: "weighted";
            weights: {
                momentum: number;
                meanrev: number;
                breakout: number;
                obi: number;
                cvd: number;
                anomaly: number;
            };
        };
    };
    backtest: {
        costs_bps: {
            maker: number;
            taker: number;
        };
        slippage: {
            model: "depth_proxy";
            depth_levels: number;
        };
    };
}): string;
export declare function parquetRoot(cfg?: {
    universe: string[];
    intervals: ["1m" | "5m" | "15m" | "1h" | "4h" | "1d", ...("1m" | "5m" | "15m" | "1h" | "4h" | "1d")[]];
    storage_root: string;
    retention: {
        candles_days: number;
    };
    ui: {
        theme: "dark" | "light";
        timezone: string;
    };
    ws: {
        url: string;
        heartbeat_sec: number;
    };
    backfill: {
        lookback_days: number;
        window_candles: number;
        max_concurrency: number;
    };
    signals: {
        presets: string[];
        scoring: {
            combine: "weighted";
            weights: {
                momentum: number;
                meanrev: number;
                breakout: number;
                obi: number;
                cvd: number;
                anomaly: number;
            };
        };
    };
    backtest: {
        costs_bps: {
            maker: number;
            taker: number;
        };
        slippage: {
            model: "depth_proxy";
            depth_levels: number;
        };
    };
}): string;
export declare function dbPath(cfg?: {
    universe: string[];
    intervals: ["1m" | "5m" | "15m" | "1h" | "4h" | "1d", ...("1m" | "5m" | "15m" | "1h" | "4h" | "1d")[]];
    storage_root: string;
    retention: {
        candles_days: number;
    };
    ui: {
        theme: "dark" | "light";
        timezone: string;
    };
    ws: {
        url: string;
        heartbeat_sec: number;
    };
    backfill: {
        lookback_days: number;
        window_candles: number;
        max_concurrency: number;
    };
    signals: {
        presets: string[];
        scoring: {
            combine: "weighted";
            weights: {
                momentum: number;
                meanrev: number;
                breakout: number;
                obi: number;
                cvd: number;
                anomaly: number;
            };
        };
    };
    backtest: {
        costs_bps: {
            maker: number;
            taker: number;
        };
        slippage: {
            model: "depth_proxy";
            depth_levels: number;
        };
    };
}): string;
export declare function dirFor(coin: string, interval: string, date: string, cfg?: {
    universe: string[];
    intervals: ["1m" | "5m" | "15m" | "1h" | "4h" | "1d", ...("1m" | "5m" | "15m" | "1h" | "4h" | "1d")[]];
    storage_root: string;
    retention: {
        candles_days: number;
    };
    ui: {
        theme: "dark" | "light";
        timezone: string;
    };
    ws: {
        url: string;
        heartbeat_sec: number;
    };
    backfill: {
        lookback_days: number;
        window_candles: number;
        max_concurrency: number;
    };
    signals: {
        presets: string[];
        scoring: {
            combine: "weighted";
            weights: {
                momentum: number;
                meanrev: number;
                breakout: number;
                obi: number;
                cvd: number;
                anomaly: number;
            };
        };
    };
    backtest: {
        costs_bps: {
            maker: number;
            taker: number;
        };
        slippage: {
            model: "depth_proxy";
            depth_levels: number;
        };
    };
}): string;
export declare function ensureBaseDirs(cfg?: {
    universe: string[];
    intervals: ["1m" | "5m" | "15m" | "1h" | "4h" | "1d", ...("1m" | "5m" | "15m" | "1h" | "4h" | "1d")[]];
    storage_root: string;
    retention: {
        candles_days: number;
    };
    ui: {
        theme: "dark" | "light";
        timezone: string;
    };
    ws: {
        url: string;
        heartbeat_sec: number;
    };
    backfill: {
        lookback_days: number;
        window_candles: number;
        max_concurrency: number;
    };
    signals: {
        presets: string[];
        scoring: {
            combine: "weighted";
            weights: {
                momentum: number;
                meanrev: number;
                breakout: number;
                obi: number;
                cvd: number;
                anomaly: number;
            };
        };
    };
    backtest: {
        costs_bps: {
            maker: number;
            taker: number;
        };
        slippage: {
            model: "depth_proxy";
            depth_levels: number;
        };
    };
}): void;
