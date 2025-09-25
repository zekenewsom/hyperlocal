import { NextResponse } from 'next/server';
import { storageStatus, candlesBreakdown, ensureBaseDirs, getDb, parquetRoot, initDuckDb } from '@hyperlocal/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Ensure DB and views exist so the page never requires manual init
  ensureBaseDirs();
  try { await initDuckDb(); } catch {}
  const st = await storageStatus();
  const breakdown = await candlesBreakdown();
  // Inline fallback for per-source breakdown to avoid dependency on a new export build
  let breakdown_by_source: Array<{ src: string; coin: string; interval: string; rows: number; min_ms: number; max_ms: number }> = [];
  try {
    const conn = getDb().connect();
    try {
      // Recreate parquet view in case new files landed
      const p = parquetRoot().replace(/'/g, "''");
      await new Promise<void>((res, rej)=> conn.all(`CREATE OR REPLACE VIEW candles_pq AS SELECT * FROM read_parquet('${p}/**/*.parquet', hive_partitioning=true);`, (e)=> e?rej(e):res()));
      const q = `
        SELECT src, coin, interval, COUNT(*) AS c, MIN(open_time) AS min_ms, MAX(open_time) AS max_ms
        FROM candles_pq
        GROUP BY src, coin, interval
        ORDER BY src, coin, interval
      `;
      const rows = await new Promise<any[]>((res, rej)=> conn.all(q, (e,r)=> e?rej(e):res(r)));
      breakdown_by_source = rows.map((r)=> ({
        src: String((r as any).src),
        coin: String((r as any).coin),
        interval: String((r as any).interval),
        rows: Number((r as any).c ?? 0),
        min_ms: Number((r as any).min_ms ?? 0),
        max_ms: Number((r as any).max_ms ?? 0)
      }));
    } finally { conn.close(); }
  } catch {}
  return NextResponse.json({ ...st, breakdown, breakdown_by_source });
}
