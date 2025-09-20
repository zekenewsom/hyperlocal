import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import YAML from 'yaml';

const Scoring = z.object({
  combine: z.literal('weighted'),
  weights: z.object({
    momentum: z.number(),
    meanrev: z.number(),
    breakout: z.number(),
    obi: z.number(),
    cvd: z.number(),
    anomaly: z.number()
  })
});

export const ConfigSchema = z.object({
  universe: z.array(z.string()).min(1),
  intervals: z.array(z.enum(['1m','5m','15m','1h','4h','1d'])).nonempty(),
  storage_root: z.string(),
  retention: z.object({ candles_days: z.number().int().min(0) }),
  ui: z.object({ theme: z.enum(['dark','light']).default('dark'), timezone: z.string() }),
  ws: z.object({ url: z.string().url(), heartbeat_sec: z.number().int().min(10) }),
  backfill: z.object({
    lookback_days: z.number().int().min(1),
    window_candles: z.number().int().min(100).max(5000),
    max_concurrency: z.number().int().min(1).max(8),
    min_candles_per_interval: z.number().int().min(0).default(5000)
  }),
  binance: z.object({
    enabled: z.boolean().default(true),
    base_url: z.string().url().default('https://api.binance.us'),
    weight_per_min: z.number().int().min(1).default(600)
  }).default({ enabled: true, base_url: 'https://api.binance.us', weight_per_min: 600 }),
  signals: z.object({ presets: z.array(z.string()), scoring: Scoring }),
  backtest: z.object({ costs_bps: z.object({ maker: z.number(), taker: z.number() }), slippage: z.object({ model: z.enum(['depth_proxy']), depth_levels: z.number().int().min(1) }) })
});
export type AppConfig = z.infer<typeof ConfigSchema>;

function readYaml(file: string): any {
  if (!fs.existsSync(file)) return {};
  const txt = fs.readFileSync(file, 'utf8');
  return YAML.parse(txt) ?? {};
}

function findConfigsRoot(startDir: string): string | null {
  let cur = path.resolve(startDir);
  const fsRoot = path.parse(cur).root;
  // Walk up until filesystem root
  while (cur !== fsRoot) {
    const candidate = path.join(cur, 'configs', 'default.config.yaml');
    if (fs.existsSync(candidate)) return path.join(cur, 'configs');
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Check root once more
  const rootCandidate = path.join(fsRoot, 'configs', 'default.config.yaml');
  if (fs.existsSync(rootCandidate)) return path.join(fsRoot, 'configs');
  return null;
}

export function loadConfig(): AppConfig {
  const envPath = process.env.HYPERLOCAL_CONFIG ? path.resolve(process.env.HYPERLOCAL_CONFIG) : null;

  const configsRoot = findConfigsRoot(process.cwd());
  const defaultPath = configsRoot ? path.join(configsRoot, 'default.config.yaml') : '';
  const localPath = configsRoot ? path.join(configsRoot, 'local.config.yaml') : '';

  const merged = {
    ...(defaultPath ? readYaml(defaultPath) : {}),
    ...(localPath ? readYaml(localPath) : {}),
    ...(envPath ? readYaml(envPath) : {})
  };
  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    const hint = configsRoot
      ? `configsRoot=${configsRoot}`
      : 'configs/ directory not found upward from ' + process.cwd();
    throw new Error('Config validation failed:\n' + issues + `\n[hint] ${hint}`);
  }
  return parsed.data;
}
