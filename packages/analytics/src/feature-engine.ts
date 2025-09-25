import { getDb } from '@hyperlocal/storage';
import type { Candle, L2Book, Bbo, Trade, Interval } from '@hyperlocal/types';
import { EWVar, lambdaFromHalfLife, ATR, RSI, Stoch, RollingMeanStd } from '@hyperlocal/indicators';
import { microprice, obiTop, obiCum } from '@hyperlocal/indicators';
import { loadConfig } from '@hyperlocal/core';

type BarAgg = {
  bbo?: Bbo;
  book?: L2Book;
  trades: Trade[];
  prevClose?: number;
};

function intervalMs(i: Interval): number {
  switch(i){
    case '1m': return 60_000; case '5m': return 300_000; case '15m': return 900_000;
    case '1h': return 3_600_000; case '4h': return 14_400_000; case '1d': return 86_400_000;
  }
}

class PerSeries {
  // price/volatility
  ewvar: EWVar; atr: ATR; rsi: RSI; stoch: Stoch;
  volStat: RollingMeanStd;
  // for regimes & spikes
  ewvarShort: EWVar; ewvarLong: EWVar;
  // rolling book/trade info
  agg: BarAgg = { trades: [] };

  constructor(public coin:string, public interval: Interval){
    const lam = lambdaFromHalfLife(50);
    const lamS = lambdaFromHalfLife(10), lamL = lambdaFromHalfLife(200);
    this.ewvar = new EWVar(lam);
    this.ewvarShort = new EWVar(lamS);
    this.ewvarLong  = new EWVar(lamL);
    this.atr = new ATR(14);
    this.rsi = new RSI(14);
    this.stoch = new Stoch(14, 3);
    this.volStat = new RollingMeanStd(100);
  }
}

export class FeatureEngine {
  private m = new Map<string, PerSeries>();
  private running = false;
  private writeConn: any | null = null;

  private key(coin:string, itv:Interval){ return `${coin}:${itv}`; }
  private get(coin:string, itv:Interval){
    const k = this.key(coin,itv); let s = this.m.get(k);
    if (!s) { s = new PerSeries(coin,itv); this.m.set(k, s); }
    return s;
  }

  start(){ this.running = true; }
  stop(){
    this.running = false;
    try { this.writeConn?.close?.(); } catch {}
    this.writeConn = null;
  }

  private getWriteConn(){
    if (this.writeConn) return this.writeConn;
    this.writeConn = getDb().connect();
    return this.writeConn;
  }

  // Warm-up internal indicator states by replaying recent Hyperliquid candles from storage.
  // This computes and persists features for those historical bars as well.
  async warmup(barsPerInterval = 1000) {
    const cfg = loadConfig();
    const conn = getDb().connect();
    const rowsToCandle = (r: any): Candle => ({
      src: 'hyperliquid',
      coin: String(r.coin),
      interval: String(r.interval) as Interval,
      openTime: Number(r.open_time),
      closeTime: Number(r.close_time),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      volume: Number(r.volume),
      tradeCount: r.trade_count ? Number(r.trade_count) : undefined,
      vwap: r.vwap ? Number(r.vwap) : undefined
    });
    // Temporarily enable processing
    const prev = this.running; this.running = true;
    try {
      for (const coin of cfg.universe) {
        for (const interval of cfg.intervals as Interval[]) {
          const q = `
            SELECT src, coin, interval, open_time, close_time, open, high, low, close, volume, trade_count, vwap
            FROM candles_pq
            WHERE src='hyperliquid' AND coin='${coin}' AND interval='${interval}'
            ORDER BY open_time DESC
            LIMIT ${Math.max(1, Math.min(10000, barsPerInterval))}
          `;
          const rs = await new Promise<any[]>((res, rej)=> conn.all(q, (e: any, rows: any[])=> e?rej(e):res(rows)));
          const candles = rs.reverse().map(rowsToCandle);
          for (const c of candles) await this.onCandle(c);
        }
      }
    } finally {
      conn.close();
      this.running = prev;
    }
  }

  onBbo(b: Bbo){ if (!this.running) return; for (const [, s] of this.m) s.agg.bbo = b; }
  onBook(b: L2Book){ if (!this.running) return; for (const [, s] of this.m) if (s.coin===b.coin) s.agg.book = b; }
  onTrade(t: Trade){ if (!this.running) return; for (const [, s] of this.m) if (s.coin===t.coin) s.agg.trades.push(t); }

  async onCandle(c: Candle){
    if (!this.running) return;
    const s = this.get(c.coin, c.interval);

    // returns
    const ret_log = s.agg.prevClose===undefined ? 0 : Math.log(c.close / s.agg.prevClose);
    const ret_pct = s.agg.prevClose===undefined ? 0 : (c.close / s.agg.prevClose - 1);

    // vol
    const v_ew = Math.sqrt(s.ewvar.push(ret_log));
    const v_s  = Math.sqrt(s.ewvarShort.push(ret_log));
    const v_l  = Math.sqrt(s.ewvarLong.push(ret_log));
    const var_spike = (v_l>0) ? (v_s / v_l) : 0;

    // ATR/RSI/Stoch
    const atr = s.atr.push(c.high, c.low, c.close);
    const rsi = s.rsi.push(c.close);
    const { k: stoch_k, d: stoch_d } = s.stoch.push(c.high, c.low, c.close);

    // volume z-score
    s.volStat.push(c.volume);
    const vol_z = s.volStat.z(c.volume);

    // orderbook + microprice at close using latest snapshot
    let obi_top = 0, obi_cum = 0, micro = Number.NaN;
    if (s.agg.book) {
      obi_top = obiTop(s.agg.book.bids, s.agg.book.asks, 5);
      obi_cum = obiCum(s.agg.book.bids, s.agg.book.asks);
    }
    if (s.agg.bbo) {
      micro = microprice(s.agg.bbo.bidPrice, s.agg.bbo.bidSize, s.agg.bbo.askPrice, s.agg.bbo.askSize);
    }

    // CVD & slope (simple = delta over bar duration)
    let cvd = 0;
    for (const t of s.agg.trades) {
      if (t.side==='buy') cvd += t.size; else if (t.side==='sell') cvd -= t.size;
    }
    const dur = intervalMs(c.interval);
    const cvd_slope = dur>0 ? (cvd/dur) : 0;

    // regimes (simple z over ewvol)
    const volp = s.volStat.mean() ? (c.volume / s.volStat.mean()) : 1;
    const zvol = (v_ew && v_l) ? (v_ew - v_l)/ (0.000001 + v_l) : 0;
    const vol_regime = zvol < -0.2 ? 'low' : zvol > 0.2 ? 'high' : 'mid';

    // breakout structure (placeholder)
    const hh_ll_state = (c.close >= c.high) ? 'trend_up' : (c.close <= c.low ? 'trend_down' : 'range');
    const hh_count = hh_ll_state==='trend_up' ? 1 : 0;
    const hl_count = hh_ll_state==='trend_down' ? 1 : 0;

    // persist
    const conn = this.getWriteConn();
    try {
      const closeSec = c.closeTime / 1000.0;
      const num = (x: number) => (Number.isFinite(x) ? String(x) : 'NULL');
      const str = (s: string) => `'${s.replace(/'/g, "''")}'`;
      const insertSql = `
        INSERT OR REPLACE INTO features (
          src, coin, interval, close_time,
          ret_log, ret_pct, ewvar, ewvol, atr,
          rsi, stoch_k, stoch_d, vol_z,
          cvd, cvd_slope, obi_top, obi_cum, microprice,
          var_spike, vol_regime, volp,
          hh_ll_state, hh_count, hl_count,
          computed_at
        ) VALUES (
          'hyperliquid', ${str(c.coin)}, ${str(c.interval)}, to_timestamp(${closeSec}),
          ${num(ret_log)}, ${num(ret_pct)}, ${num(s.ewvar.value())}, ${num(v_ew)}, ${num(atr)},
          ${num(rsi)}, ${num(stoch_k)}, ${num(stoch_d)}, ${num(vol_z)},
          ${num(cvd)}, ${num(cvd_slope)}, ${num(obi_top)}, ${num(obi_cum)}, ${num(micro)},
          ${num(var_spike)}, ${str(vol_regime)}, ${num(volp)},
          ${str(hh_ll_state)}, ${hh_count}, ${hl_count},
          now()
        )`;
      await new Promise<void>((res, rej)=> conn.all(insertSql, (e)=> e?rej(e):res()));
    } finally {
      // keep connection open for reuse while running
    }

    // roll prevClose & clear bar aggregates
    s.agg.prevClose = c.close;
    s.agg.trades = [];
  }

  status(){
    return { running: this.running, series: Array.from(this.m.keys()) };
  }
}
