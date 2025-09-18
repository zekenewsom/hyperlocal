import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../src/config';

describe('config loader', () => {
  beforeAll(() => {
    // Point loader to the repo default config explicitly
    const cfgPath = path.resolve(__dirname, '../../..', 'configs', 'default.config.yaml');
    process.env.HYPERLOCAL_CONFIG = cfgPath;
  });
  it('loads and validates default config', () => {
    const cfg = loadConfig();
    expect(cfg.universe[0]).toBe('BTC');
    expect(cfg.ui.theme).toBe('dark');
  });
});
