export declare function microprice(bid: number, bidSz: number, ask: number, askSz: number): number;
export declare function obiTop(bids: Array<{
    price: number;
    size: number;
}>, asks: Array<{
    price: number;
    size: number;
}>, N?: number): number;
export declare function obiCum(bids: Array<{
    price: number;
    size: number;
}>, asks: Array<{
    price: number;
    size: number;
}>): number;
export declare function cvdUpdate(prev: number, trades: Array<{
    side: 'buy' | 'sell' | 'undetermined';
    size: number;
}>): number;
