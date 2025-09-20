import type { Candle } from '@hyperlocal/types';
/**
 * Write candles into partitioned Parquet files.
 * Path: parquet/{coin}/{interval}/date=YYYY-MM-DD/*.parquet
 * Returns list of file paths written.
 */
export declare function writeCandlesParquet(rows: Candle[]): Promise<string[]>;
