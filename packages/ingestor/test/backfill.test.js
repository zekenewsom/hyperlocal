import { describe, it, expect, beforeAll } from 'vitest';
import { CandleBackfill } from '../src/backfill.js';
import { parquetRoot } from '@hyperlocal/storage';
import fs from 'node:fs';
import path from 'node:path';
// Stub global fetch to return mocked payload
beforeAll(() => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, _init) => {
        const now = Date.now();
        const rows = Array.from({ length: 300 }, (_, i) => ({
            t: now - (299 - i) * 60_000,
            T: now - (299 - i) * 60_000 + 59_999,
            s: 'BTC', i: '1m', o: 100 + i * 0.01, c: 100 + i * 0.01, h: 101, l: 99, v: 1.23, n: 10
        }));
        return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
    });
});
it('writes parquet files with mocked candleSnapshot', async () => {
    const bf = new CandleBackfill();
    await bf.runStartupBackfill(Date.now()); // uses config intervals; default includes 1m etc
    // Expect parquet files under BTC partitions
    const root = parquetRoot();
    const btc = path.join(root, 'BTC');
    const exists = fs.existsSync(btc);
    expect(exists).toBe(true);
});
