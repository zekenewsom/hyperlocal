import path from 'node:path';
import fs from 'node:fs';
import duckdb from 'duckdb';
import { dbPath, parquetRoot } from './layout.js';
let _db = null;
export function getDb() {
    if (_db)
        return _db;
    const file = dbPath();
    if (!file || typeof file !== 'string') {
        throw new Error(`Invalid DuckDB path computed: ${String(file)}`);
    }
    const db = new duckdb.Database(file);
    _db = db;
    return db;
}
function sql(conn, q, params = []) {
    return new Promise((resolve, reject) => {
        const cb = (err, rows) => (err ? reject(err) : resolve(rows));
        if (params && params.length > 0) {
            conn.all(q, params, cb);
        }
        else {
            conn.all(q, cb);
        }
    });
}
export async function initDuckDb() {
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
      computed_at TIMESTAMP,
      PRIMARY KEY (src, coin, interval, close_time)
    );
  `);
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
export async function createParquetViews(conn) {
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
    if (!conn)
        c.close();
}
export async function storageStatus() {
    const dbExists = fs.existsSync(dbPath());
    const root = parquetRoot();
    let files = 0, rows = 0;
    if (fs.existsSync(root)) {
        const stack = [root];
        while (stack.length) {
            const d = stack.pop();
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory())
                    stack.push(p);
                else if (e.isFile() && p.endsWith('.parquet'))
                    files++;
            }
        }
    }
    if (dbExists) {
        const conn = getDb().connect();
        try {
            await createParquetViews(conn);
            const r = await sql(conn, `SELECT COUNT(*) as c FROM candles_pq;`);
            const c = (r && r[0] && r[0].c) ?? 0;
            rows = typeof c === 'bigint' ? Number(c) : Number(c);
        }
        catch {
            rows = 0;
        }
        finally {
            conn.close();
        }
    }
    return { db_exists: dbExists, parquet_root: root, parquet_files: files, candles_rows: rows };
}
export async function candlesBreakdown() {
    const out = [];
    if (!fs.existsSync(dbPath()))
        return out;
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
            const c = r.c;
            const minv = r.min_ms;
            const maxv = r.max_ms;
            out.push({
                coin: String(r.coin),
                interval: String(r.interval),
                rows: typeof c === 'bigint' ? Number(c) : Number(c ?? 0),
                min_ms: typeof minv === 'bigint' ? Number(minv) : Number(minv ?? 0),
                max_ms: typeof maxv === 'bigint' ? Number(maxv) : Number(maxv ?? 0),
            });
        }
    }
    catch {
        // ignore
    }
    finally {
        conn.close();
    }
    return out;
}
