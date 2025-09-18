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
  backfill: z.object({ lookback_days: z.number().int().min(1), window_candles: z.number().int().min(100).max(5000), max_concurrency: z.number().int().min(1).max(8) }),
  signals: z.object({ presets: z.array(z.string()), scoring: Scoring }),
  backtest: z.object({ costs_bps: z.object({ maker: z.number(), taker: z.number() }), slippage: z.object({ model: z.enum(['depth_proxy']), depth_levels: z.number().int().min(1) }) })
});
export type AppConfig = z.infer<typeof ConfigSchema>;

function readYaml(file: string): any {
  if (!fs.existsSync(file)) return {};
  const txt = fs.readFileSync(file, 'utf8');
  return YAML.parse(txt) ?? {};
}

export function loadConfig(): AppConfig {
  const root = process.cwd();
  const defaultPath = path.join(root, 'configs', 'default.config.yaml');
  const localPath = path.join(root, 'configs', 'local.config.yaml');
  const envPath = process.env.HYPERLOCAL_CONFIG ? path.resolve(process.env.HYPERLOCAL_CONFIG) : null;

  const merged = {
    ...readYaml(defaultPath),
    ...readYaml(localPath),
    ...(envPath ? readYaml(envPath) : {})
  };
  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error('Config validation failed:\n' + issues);
  }
  return parsed.data;
}

