import fs from 'node:fs';
import path from 'node:path';
import { getCfg, parquetRoot } from './layout.js';
import { getDb } from './duck.js';

export function resetIntervalParquet(interval: string, coins?: string[]): { deletedFiles: number; deletedDirs: number } {
  const cfg = getCfg();
  const root = parquetRoot(cfg);
  const targets = (coins && coins.length ? coins : cfg.universe).map((c) => path.join(root, c, interval));
  let deletedFiles = 0;
  let deletedDirs = 0;
  for (const t of targets) {
    if (!fs.existsSync(t)) continue;
    for (const entry of fs.readdirSync(t, { withFileTypes: true })) {
      const p = path.join(t, entry.name);
      if (entry.isDirectory() && entry.name.startsWith('date=')) {
        // remove parquet files then dir
        for (const f of fs.readdirSync(p, { withFileTypes: true })) {
          if (f.isFile() && f.name.endsWith('.parquet')) {
            fs.unlinkSync(path.join(p, f.name));
            deletedFiles++;
          }
        }
        fs.rmSync(p, { recursive: true, force: true });
        deletedDirs++;
      }
    }
  }
  return { deletedFiles, deletedDirs };
}

export async function deleteFeaturesForInterval(interval: string, coins?: string[]) {
  const db = getDb();
  const conn = db.connect();
  try {
    if (coins && coins.length) {
      const inlist = coins.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
      await new Promise<void>((res, rej) => conn.all(`DELETE FROM features WHERE interval='${interval}' AND coin IN (${inlist})`, (e) => (e ? rej(e) : res())));
    } else {
      await new Promise<void>((res, rej) => conn.all(`DELETE FROM features WHERE interval='${interval}'`, (e) => (e ? rej(e) : res())));
    }
  } finally {
    conn.close();
  }
}

