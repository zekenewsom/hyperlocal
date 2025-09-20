export declare const clamp: (x: number, lo: number, hi: number) => number;
export declare class EMA {
    private ready;
    private v;
    private a;
    constructor(n: number);
    push(x: number): number;
    value(): number;
}
export declare class Wilder {
    private ready;
    private v;
    private a;
    constructor(n: number);
    push(x: number): number;
    value(): number;
}
export declare function returnsPct(prevClose: number | undefined, close: number): number;
export declare function returnsLog(prevClose: number | undefined, close: number): number;
export declare class EWVar {
    private lambda;
    private v;
    private ready;
    constructor(lambda: number);
    push(retLog: number): number;
    value(): number;
}
export declare function lambdaFromHalfLife(hlBars: number): number;
export declare class ATR {
    private w;
    private prevClose?;
    constructor(n: number);
    push(high: number, low: number, close: number): number;
    value(): number;
}
export declare class RSI {
    private avgG;
    private avgL;
    private prev?;
    constructor(n: number);
    push(close: number): number;
}
export declare class Stoch {
    private n;
    private m;
    private hi;
    private lo;
    private kk;
    constructor(n: number, m: number);
    push(high: number, low: number, close: number): {
        k: number;
        d: number;
    };
}
