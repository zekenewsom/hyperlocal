export const clamp = (x:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, x));

export class EMA {
  private ready=false; private v=0; private a:number;
  constructor(n:number){ this.a = 2/(n+1); }
  push(x:number){ this.v = this.ready ? (this.a*x + (1-this.a)*this.v) : x; this.ready=true; return this.v; }
  value(){ return this.v; }
}
export class Wilder {
  private ready=false; private v=0; private a:number;
  constructor(n:number){ this.a = 1/n; }
  push(x:number){ this.v = this.ready ? (this.v + this.a*(x - this.v)) : x; this.ready = true; return this.v; }
  value(){ return this.v; }
}

export function returnsPct(prevClose:number|undefined, close:number){
  return prevClose===undefined ? 0 : (close/prevClose - 1);
}
export function returnsLog(prevClose:number|undefined, close:number){
  return prevClose===undefined ? 0 : Math.log(close/prevClose);
}

export class EWVar {
  private v = 0; private ready=false;
  constructor(private lambda:number){ /* lambda in (0,1) */ }
  push(retLog:number){
    this.v = this.ready ? (this.lambda*this.v + (1-this.lambda)*retLog*retLog) : retLog*retLog;
    this.ready = true; return this.v;
  }
  value(){ return this.v; }
}
export function lambdaFromHalfLife(hlBars:number) {
  return Math.exp(Math.log(0.5)/hlBars);
}

export class ATR {
  private w: Wilder;
  private prevClose?: number;
  constructor(n:number){ this.w = new Wilder(n); }
  push(high:number, low:number, close:number){
    const tr = Math.max(
      high - low,
      this.prevClose!==undefined ? Math.abs(high - this.prevClose) : 0,
      this.prevClose!==undefined ? Math.abs(low - this.prevClose) : 0
    );
    this.prevClose = close;
    return this.w.push(tr);
  }
  value(){ return this.w.value(); }
}

export class RSI {
  private avgG: Wilder; private avgL: Wilder; private prev?: number;
  constructor(n:number){ this.avgG = new Wilder(n); this.avgL = new Wilder(n); }
  push(close:number){
    const diff = this.prev===undefined ? 0 : close - this.prev;
    this.prev = close;
    const g = Math.max(0, diff), l = Math.max(0, -diff);
    const ag = this.avgG.push(g), al = this.avgL.push(l);
    const rs = al === 0 ? (ag>0 ? Infinity : 0) : ag/al;
    return 100 - 100/(1+rs);
  }
}

export class Stoch {
  private hi: number[] = []; private lo: number[] = [];
  private kk: number[] = [];
  constructor(private n:number, private m:number){ }
  push(high:number, low:number, close:number){
    this.hi.push(high); this.lo.push(low);
    if (this.hi.length>this.n) this.hi.shift();
    if (this.lo.length>this.n) this.lo.shift();
    const hh = Math.max(...this.hi), ll = Math.min(...this.lo);
    const k = (hh===ll) ? 50 : (100*(close-ll)/(hh-ll));
    this.kk.push(k); if (this.kk.length>this.m) this.kk.shift();
    const d = this.kk.reduce((a,b)=>a+b,0)/this.kk.length;
    return { k, d };
  }
}

