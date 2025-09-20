export declare class Ring {
    private capacity;
    private a;
    private i;
    private f;
    private _size;
    constructor(capacity: number);
    get size(): number;
    push(x: number): number | undefined;
    values(): number[];
    get cap(): number;
}
export declare class RollingMeanStd {
    private n;
    private buf;
    private sum;
    private sum2;
    constructor(n: number);
    push(x: number): void;
    mean(): number;
    std(): number;
    z(x: number): number;
}
