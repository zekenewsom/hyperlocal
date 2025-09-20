export class Ring {
  private a: number[]; private i = 0; private f = 0; private _size = 0;
  constructor(private capacity: number) { this.a = new Array(capacity); }
  get size() { return this._size; }
  push(x: number): number | undefined {
    const ev = this._size === this.cap ? this.a[this.i] : undefined;
    this.a[this.i] = x;
    this.i = (this.i + 1) % this.cap;
    if (this._size < this.cap) this._size++;
    else this.f = (this.f + 1) % this.cap;
    return ev;
  }
  values(): number[] {
    const out: number[] = [];
    for (let k = 0; k < this._size; k++) out.push(this.a[(this.f + k) % this.cap]!);
    return out;
  }
  get cap(){ return this.a.length; }
}
export class RollingMeanStd {
  private buf: Ring; private sum=0; private sum2=0;
  constructor(private n: number) { this.buf = new Ring(n); }
  push(x: number) {
    const ev = this.buf.push(x);
    this.sum += x; this.sum2 += x*x;
    if (ev !== undefined) { this.sum -= ev; this.sum2 -= ev*ev; }
  }
  mean(){ return this.buf.size ? this.sum/this.buf.size : NaN; }
  std(){
    const m = this.mean(); if (!this.buf.size) return NaN;
    const v = Math.max(0, this.sum2/this.buf.size - m*m);
    return Math.sqrt(v);
  }
  z(x: number){ const s = this.std(); return Number.isFinite(s) && s>0 ? (x - this.mean())/s : 0; }
}
