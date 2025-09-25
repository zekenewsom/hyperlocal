import path from 'node:path';
import fs from 'node:fs';
import duckdb from 'duckdb';
import { dbPath, parquetRoot } from './layout.js';

let _db: duckdb.Database | null = null;

export function getDb(): duckdb.Database {
  if (_db) return _db;
  const file = dbPath();
  if (!file || typeof file !== 'string') {
    throw new Error(`Invalid DuckDB path computed: ${String(file)}`);
  }
  const db = new duckdb.Database(file);
  _db = db;
  return db;
}

function sql(conn: duckdb.Connection, q: string, params: any[] = []) {
  return new Promise<any[]>((resolve, reject) => {
    const cb = (err: any, rows: any[]) => (err ? reject(err) : resolve(rows));
    if (params && params.length > 0) {
      conn.all(q, params, cb);
    } else {
      conn.all(q, cb);
    }
  });
}

export async function initDuckDb(): Promise<void> {
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = getDb();
  const conn = db.connect();

  // Logical tables (we'll mostly use Parquet views for now)
  await sql(conn, `
    CREATE TABLE IF NOT EXISTS features (
      src TEXT, coin TEXT, interval TEXT, close_time TIMESTAMP,
      ret_log DOUBLE, ret_pct DOUBLE, ewvar DOUBLE, ewvol DOUBLE, atr DOUBLE,
      rsi DOUBLE, stoch_k DOUBLE, stoch_d DOUBLE, vol_z DOUBLE,
      cvd DOUBLE, cvd_slope DOUBLE, obi_top DOUBLE, obi_cum DOUBLE, microprice DOUBLE,
      var_spike DOUBLE, vol_regime TEXT, volp DOUBLE,
      hh_ll_state TEXT, hh_count INTEGER, hl_count INTEGER,
      ema_s DOUBLE, ema_l DOUBLE,
      computed_at TIMESTAMP,
      PRIMARY KEY (src, coin, interval, close_time)
    );
  `);

  // Backfill columns if the table already existed without EMA fields
  try { await sql(conn, `ALTER TABLE features ADD COLUMN IF NOT EXISTS ema_s DOUBLE;`); } catch {}
  try { await sql(conn, `ALTER TABLE features ADD COLUMN IF NOT EXISTS ema_l DOUBLE;`); } catch {}

  await sql(conn, `
    CREATE TABLE IF NOT EXISTS signals (
      src TEXT, coin TEXT, interval TEXT, close_time TIMESTAMP,
      s_momentum DOUBLE, s_meanrev DOUBLE, s_breakout DOUBLE,
      s_obi DOUBLE, s_cvd DOUBLE, s_anom DOUBLE,
      score DOUBLE, confidence DOUBLE, expl JSON,
      PRIMARY KEY (src, coin, interval, close_time)
    );
  `);

  await createParquetViews(conn);

  conn.close();
}

export async function createParquetViews(conn?: duckdb.Connection) {
  const db = getDb();
  const c = conn ?? db.connect();
  const p = parquetRoot();
  await sql(c, `CREATE OR REPLACE VIEW candles_pq AS
    SELECT * FROM read_parquet('${p.replace(/'/g, "''")}/**/*.parquet', hive_partitioning=true);
  `);

  await sql(c, `CREATE OR REPLACE VIEW candles_pq_ordered AS
    SELECT src, coin, interval,
           to_timestamp(open_time/1000.0) AS open_time,
           to_timestamp(close_time/1000.0) AS close_time,
           open, high, low, close, volume, trade_count, vwap, date
    FROM candles_pq
    ORDER BY coin, interval, open_time;
  `);
  if (!conn) c.close();
}

export async function storageStatus(): Promise<{
  db_exists: boolean;
  parquet_root: string;
  parquet_files: number;
  candles_rows: number;
}> {
  const dbExists = fs.existsSync(dbPath());
  const root = parquetRoot();
  let files = 0, rows = 0;

  if (fs.existsSync(root)) {
    const stack = [root];
    while (stack.length) {
      const d = stack.pop()!;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile() && p.endsWith('.parquet')) files++;
      }
    }
  }

  if (dbExists) {
    const conn = getDb().connect();
    try {
      await createParquetViews(conn);
      const r = await sql(conn, `SELECT COUNT(*) as c FROM candles_pq;`);
      const c = (r && r[0] && (r[0] as any).c) ?? 0;
      rows = typeof c === 'bigint' ? Number(c) : Number(c);
    } catch {
      rows = 0;
    } finally {
      conn.close();
    }
  }

  return { db_exists: dbExists, parquet_root: root, parquet_files: files, candles_rows: rows };
}

export async function candlesBreakdown(): Promise<Array<{ coin: string; interval: string; rows: number; min_ms: number; max_ms: number }>> {
  const out: Array<{ coin: string; interval: string; rows: number; min_ms: number; max_ms: number }> = [];
  if (!fs.existsSync(dbPath())) return out;
  const conn = getDb().connect();
  try {
    await createParquetViews(conn);
    const rows = await sql(conn, `
      SELECT coin, interval, COUNT(*) AS c, MIN(open_time) AS min_ms, MAX(open_time) AS max_ms
      FROM candles_pq
      GROUP BY coin, interval
      ORDER BY coin, interval;
    `);
    for (const r of rows) {
      const c = (r as any).c;
      const minv = (r as any).min_ms;
      const maxv = (r as any).max_ms;
      out.push({
        coin: String((r as any).coin),
        interval: String((r as any).interval),
        rows: typeof c === 'bigint' ? Number(c) : Number(c ?? 0),
        min_ms: typeof minv === 'bigint' ? Number(minv) : Number(minv ?? 0),
        max_ms: typeof maxv === 'bigint' ? Number(maxv) : Number(maxv ?? 0),
      });
    }
  } catch {
    // ignore
  } finally {
    conn.close();
  }
  return out;
}

// Returns latest open_time (ms epoch) per series as Map("COIN:INTERVAL" -> ms)
export async function getLastCandleTimestamps(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!fs.existsSync(dbPath())) return map;
  const conn = getDb().connect();
  try {
    await createParquetViews(conn);
    const rows = await new Promise<any[]>((res, rej)=> conn.all(`
      SELECT coin || ':' || interval AS key, MAX(open_time) AS max_ts
      FROM candles_pq
      GROUP BY key
    `, (e,r)=> e?rej(e):res(r)));
    for (const r of rows) {
      const k = String((r as any).key);
      const v = Number((r as any).max_ts);
      if (Number.isFinite(v)) map.set(k, v);
    }
  } catch (e) {
    console.error('[storage] Failed to get last candle timestamps', e);
  } finally {
    conn.close();
  }
  return map;
}

// Finds gaps in Hyperliquid candles by detecting jumps larger than interval size between consecutive open_time values.
// Optional sinceMs restricts the scan to recent data for performance.
export async function findHyperliquidGaps(sinceMs?: number): Promise<Array<{ coin: string; interval: string; gap_start: number; gap_end: number; bars_missing: number }>> {
  const out: Array<{ coin: string; interval: string; gap_start: number; gap_end: number; bars_missing: number }> = [];
  if (!fs.existsSync(dbPath())) return out;
  const conn = getDb().connect();
  try {
    await createParquetViews(conn);
    const sinceCond = sinceMs && Number.isFinite(sinceMs) ? `AND open_time >= ${Number(sinceMs)}` : '';
    const q = `
      WITH ordered AS (
        SELECT coin, interval, CAST(open_time AS BIGINT) AS t
        FROM candles_pq
        WHERE src='hyperliquid' ${sinceCond}
        ORDER BY coin, interval, t
      ),
      gaps AS (
        SELECT coin, interval,
               LAG(t) OVER (PARTITION BY coin, interval ORDER BY t) AS prev,
               t AS curr
        FROM ordered
      )
      SELECT coin, interval,
             (prev + CASE interval
                        WHEN '1m' THEN 60000
                        WHEN '5m' THEN 300000
                        WHEN '15m' THEN 900000
                        WHEN '1h' THEN 3600000
                        WHEN '4h' THEN 14400000
                        WHEN '1d' THEN 86400000
                        ELSE 0
                      END) AS gap_start,
             (curr - 1) AS gap_end,
             CAST(((curr - prev) / CASE interval
                        WHEN '1m' THEN 60000
                        WHEN '5m' THEN 300000
                        WHEN '15m' THEN 900000
                        WHEN '1h' THEN 3600000
                        WHEN '4h' THEN 14400000
                        WHEN '1d' THEN 86400000
                        ELSE 0
                      END) - 1 AS BIGINT) AS bars_missing
      FROM gaps
      WHERE prev IS NOT NULL
        AND (curr - prev) > CASE interval
                        WHEN '1m' THEN 60000
                        WHEN '5m' THEN 300000
                        WHEN '15m' THEN 900000
                        WHEN '1h' THEN 3600000
                        WHEN '4h' THEN 14400000
                        WHEN '1d' THEN 86400000
                        ELSE 0
                      END
      ORDER BY coin, interval, gap_start;
    `;
    const rows = await new Promise<any[]>((res, rej)=> conn.all(q, (e,r)=> e?rej(e):res(r)));
    for (const r of rows) {
      const coin = String((r as any).coin);
      const interval = String((r as any).interval);
      const gap_start = Number((r as any).gap_start);
      const gap_end = Number((r as any).gap_end);
      const bars_missing = Number((r as any).bars_missing ?? 0);
      if (Number.isFinite(gap_start) && Number.isFinite(gap_end) && bars_missing > 0) {
        out.push({ coin, interval, gap_start, gap_end, bars_missing });
      }
    }
  } finally {
    conn.close();
  }
  return out;
}

export async function candlesBreakdownBySource(): Promise<Array<{ src: string; coin: string; interval: string; rows: number; min_ms: number; max_ms: number }>> {
  const out: Array<{ src: string; coin: string; interval: string; rows: number; min_ms: number; max_ms: number }> = [];
  if (!fs.existsSync(dbPath())) return out;
  const conn = getDb().connect();
  try {
    await createParquetViews(conn);
    const rows = await sql(conn, `
      SELECT src, coin, interval, COUNT(*) AS c, MIN(open_time) AS min_ms, MAX(open_time) AS max_ms
      FROM candles_pq
      GROUP BY src, coin, interval
      ORDER BY src, coin, interval;
    `);
    for (const r of rows) {
      const c = (r as any).c;
      const minv = (r as any).min_ms;
      const maxv = (r as any).max_ms;
      out.push({
        src: String((r as any).src),
        coin: String((r as any).coin),
        interval: String((r as any).interval),
        rows: typeof c === 'bigint' ? Number(c) : Number(c ?? 0),
        min_ms: typeof minv === 'bigint' ? Number(minv) : Number(minv ?? 0),
        max_ms: typeof maxv === 'bigint' ? Number(maxv) : Number(maxv ?? 0),
      });
    }
  } catch {
    // ignore
  } finally {
    conn.close();
  }
  return out;
}
