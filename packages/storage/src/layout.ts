import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type AppConfig } from '@hyperlocal/core';

// Resolve config once per process; consumers can pass cfg to override
export function getCfg(): AppConfig {
  return loadConfig();
}

// Resolve storage paths relative to repo root (configs/ directory parent)
function resolveRepoPath(p: string): string {
  // Lazy import to avoid circular deps if core adds helpers later
  const start = process.cwd();
  let cur = path.resolve(start);
  const fsRoot = path.parse(cur).root;
  while (cur !== fsRoot) {
    const candidate = path.join(cur, 'configs', 'default.config.yaml');
    if (fs.existsSync(candidate)) {
      const rootDir = cur; // parent of configs
      return path.resolve(rootDir, p);
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(p);
}

export function storageRoot(cfg = getCfg()): string {
  return resolveRepoPath(cfg.storage_root);
}

export function parquetRoot(cfg = getCfg()): string {
  return path.join(storageRoot(cfg), 'parquet');
}

export function dbPath(cfg = getCfg()): string {
  return path.join(storageRoot(cfg), 'hyperliquid.duckdb');
}

export function dirFor(coin: string, interval: string, date: string, cfg = getCfg()): string {
  return path.join(parquetRoot(cfg), coin, interval, `date=${date}`);
}

export function ensureBaseDirs(cfg = getCfg()) {
  const root = parquetRoot(cfg);
  fs.mkdirSync(root, { recursive: true });
  for (const coin of cfg.universe) {
    for (const itv of cfg.intervals) {
      fs.mkdirSync(path.join(root, coin, itv), { recursive: true });
    }
  }
}

