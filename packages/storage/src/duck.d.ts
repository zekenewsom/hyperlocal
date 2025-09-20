import duckdb from 'duckdb';
export declare function getDb(): duckdb.Database;
export declare function initDuckDb(): Promise<void>;
export declare function createParquetViews(conn?: duckdb.Connection): Promise<void>;
export declare function storageStatus(): Promise<{
    db_exists: boolean;
    parquet_root: string;
    parquet_files: number;
    candles_rows: number;
}>;
export declare function candlesBreakdown(): Promise<Array<{
    coin: string;
    interval: string;
    rows: number;
    min_ms: number;
    max_ms: number;
}>>;
