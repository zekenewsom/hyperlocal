export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export class EMA {
    ready = false;
    v = 0;
    a;
    constructor(n) { this.a = 2 / (n + 1); }
    push(x) { this.v = this.ready ? (this.a * x + (1 - this.a) * this.v) : x; this.ready = true; return this.v; }
    value() { return this.v; }
}
export class Wilder {
    ready = false;
    v = 0;
    a;
    constructor(n) { this.a = 1 / n; }
    push(x) { this.v = this.ready ? (this.v + this.a * (x - this.v)) : x; this.ready = true; return this.v; }
    value() { return this.v; }
}
export function returnsPct(prevClose, close) {
    return prevClose === undefined ? 0 : (close / prevClose - 1);
}
export function returnsLog(prevClose, close) {
    return prevClose === undefined ? 0 : Math.log(close / prevClose);
}
export class EWVar {
    lambda;
    v = 0;
    ready = false;
    constructor(lambda) {
        this.lambda = lambda;
    }
    push(retLog) {
        this.v = this.ready ? (this.lambda * this.v + (1 - this.lambda) * retLog * retLog) : retLog * retLog;
        this.ready = true;
        return this.v;
    }
    value() { return this.v; }
}
export function lambdaFromHalfLife(hlBars) {
    return Math.exp(Math.log(0.5) / hlBars);
}
export class ATR {
    w;
    prevClose;
    constructor(n) { this.w = new Wilder(n); }
    push(high, low, close) {
        const tr = Math.max(high - low, this.prevClose !== undefined ? Math.abs(high - this.prevClose) : 0, this.prevClose !== undefined ? Math.abs(low - this.prevClose) : 0);
        this.prevClose = close;
        return this.w.push(tr);
    }
    value() { return this.w.value(); }
}
export class RSI {
    avgG;
    avgL;
    prev;
    constructor(n) { this.avgG = new Wilder(n); this.avgL = new Wilder(n); }
    push(close) {
        const diff = this.prev === undefined ? 0 : close - this.prev;
        this.prev = close;
        const g = Math.max(0, diff), l = Math.max(0, -diff);
        const ag = this.avgG.push(g), al = this.avgL.push(l);
        const rs = al === 0 ? (ag > 0 ? Infinity : 0) : ag / al;
        return 100 - 100 / (1 + rs);
    }
}
export class Stoch {
    n;
    m;
    hi = [];
    lo = [];
    kk = [];
    constructor(n, m) {
        this.n = n;
        this.m = m;
    }
    push(high, low, close) {
        this.hi.push(high);
        this.lo.push(low);
        if (this.hi.length > this.n)
            this.hi.shift();
        if (this.lo.length > this.n)
            this.lo.shift();
        const hh = Math.max(...this.hi), ll = Math.min(...this.lo);
        const k = (hh === ll) ? 50 : (100 * (close - ll) / (hh - ll));
        this.kk.push(k);
        if (this.kk.length > this.m)
            this.kk.shift();
        const d = this.kk.reduce((a, b) => a + b, 0) / this.kk.length;
        return { k, d };
    }
}
