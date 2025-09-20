import { describe, it, expect } from 'vitest';
import { EMA, returnsLog, lambdaFromHalfLife, EWVar, ATR, RSI, Stoch, RollingMeanStd, microprice, obiTop } from '../src/index.js';

describe('core indicators', () => {
  it('ema behaves sensibly', () => {
    const e = new EMA(10);
    let v=0; for (let i=0;i<50;i++) v = e.push(i);
    expect(v).toBeGreaterThan(40);
  });
  it('ewvar rises on big returns', () => {
    const lam = lambdaFromHalfLife(50);
    const ew = new EWVar(lam);
    let last = 100;
    for (let i=0;i<200;i++){
      const close = i===100 ? 120 : last + 0.1;
      const r = returnsLog(last, close);
      ew.push(r); last = close;
    }
    expect(Math.sqrt(ew.value())).toBeGreaterThan(0);
  });
  it('atr positive', () => {
    const a = new ATR(14);
    let val=0;
    for (let i=0;i<100;i++) val = a.push(110+i, 90+i, 100+i);
    expect(val).toBeGreaterThan(0);
  });
  it('rsi within 0..100', () => {
    const r = new RSI(14);
    let v=0;
    for (let i=0;i<100;i++) v = r.push(100 + Math.sin(i/10));
    expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100);
  });
  it('stoch returns k/d', () => {
    const s = new Stoch(14,3);
    const out = s.push(110, 90, 100);
    expect(out.k).toBeGreaterThanOrEqual(0); expect(out.k).toBeLessThanOrEqual(100);
  });
  it('rolling z-score', () => {
    const r = new RollingMeanStd(20);
    for (let i=0;i<20;i++) r.push(i);
    const z = r.z(25);
    expect(z).toBeGreaterThan(0);
  });
  it('microstructure metrics', () => {
    const mp = microprice(99,10,101,8);
    expect(mp).toBeGreaterThan(99); expect(mp).toBeLessThan(101);
    const obi = obiTop([{price:99,size:5},{price:98,size:5}], [{price:101,size:1}], 2);
    expect(obi).toBeGreaterThan(0);
  });
});

