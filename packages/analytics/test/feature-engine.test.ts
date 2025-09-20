import { describe, it, expect } from 'vitest';
import { featureEngine } from '../src/index.js';
import { getDb, initDuckDb } from '@hyperlocal/storage';
import type { Candle, Bbo } from '@hyperlocal/types';

function mkCandle(t:number): Candle {
  const o=100+(Math.sin(t/60000)*2); return {
    src:'hyperliquid', coin:'BTC', interval:'1m',
    openTime:t, closeTime:t+60000-1,
    open:o, high:o+1, low:o-1, close:o+0.5, volume: 10
  };
}
const mkBbo = (t:number): Bbo => ({ coin:'BTC', ts:t, bidPrice:99, bidSize:5, askPrice:101, askSize:6 });

describe('feature engine writes features', async () => {
  it('persists rows for candle closes', async () => {
    await initDuckDb();
    featureEngine.start();
    const now = Date.now();
    for (let i=0;i<50;i++){
      featureEngine.onBbo(mkBbo(now + i*1000));
    }
    for (let i=0;i<50;i++){
      await featureEngine.onCandle(mkCandle(now + i*60000));
    }
    const conn = getDb().connect();
    try{
      const rows = await new Promise<any[]>((res,rej)=>
        conn.all(`SELECT COUNT(*) as c FROM features WHERE coin='BTC' AND interval='1m'`, (e,r)=> e?rej(e):res(r))
      );
      const c = rows && rows[0] && (rows[0] as any).c;
      const n = typeof c === 'bigint' ? Number(c) : Number(c ?? 0);
      expect(n).toBeGreaterThanOrEqual(50);
    } finally { conn.close(); }
    featureEngine.stop();
  });
});

