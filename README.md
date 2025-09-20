# Hyperlocal — Local, Signals‑Only Crypto Intelligence

Hyperlocal is a local‑only, TypeScript‑first toolkit for ingesting Hyperliquid perp market data, computing features/signals, and visualizing status in a fast, dark‑mode UI. No trading/execution/signing code — ever.

## Highlights
- Local data engine: Parquet lake + DuckDB views
- Rate‑safe ingestor: WS heartbeat, backfill via `candleSnapshot`, token buckets
- UI (Next.js): Data Health, Ingestor controls, dark theme
- Strong contracts: typed models (TS), zod‑validated config
- Guardrails: repo‑wide forbidden symbols scanner (no trading endpoints)

## Monorepo Layout
- `apps/ui` — Next.js app (Data Health, Ingestor)
- `packages/core` — config loader (zod), logging, utils
- `packages/types` — shared TS types (candles, trades, book, BBO)
- `packages/storage` — Parquet writer, DuckDB views, status
- `packages/ingestor` — HL WS client, backfill engine, controller
- `packages/cli` — CLI entry (`hyperlocal`) for DB/init/verify
- `configs/` — runtime config (`default.config.yaml`, optional `local.config.yaml`)

## Quickstart
1) Install + build packages
- `pnpm install`
- `pnpm --filter '!ui' -r build`

2) Initialize storage (optional seed)
- `pnpm db:init`
- `pnpm storage:seed`
- `pnpm storage:verify`

3) Run the UI (dev)
- `pnpm --filter ui dev`
- Open `http://localhost:3000`
  - Data Health: `/data-health` → Initialize DuckDB → Refresh
  - Ingestor: `/ingestor` → Start (runs gap backfill then WS live)

Notes
- Startup backfill respects HL rate weights and windows (≤3000 bars). It retries ms→sec and normalizes response shapes to ensure full history.
- Storage partitions: `data/hyperliquid/parquet/{coin}/{interval}/date=YYYY-MM-DD/*.parquet` (UTC date). DuckDB views read the lake with Hive partitioning.
- Testnet: override `configs/local.config.yaml` → `ws.url: wss://api.hyperliquid-testnet.xyz/ws`.

## Scripts
- `pnpm run ci` — typecheck, lint, tests, forbidden‑symbols scan
- `pnpm --filter @hyperlocal/storage test` — storage tests
- `pnpm --filter @hyperlocal/ingestor test` — ingestor tests

## Safety & Guardrails
- Signals‑only policy enforced by `scripts/forbidden-check.cjs` (CI fails on trading/execution symbols)
- No keys/secrets expected; all data remains local

## Troubleshooting
- Prefer dev mode for the UI (`pnpm --filter ui dev`). Some environments can show harmless build warnings for optional `ws` addons.
- If Data Health shows low rows after Start, wait and Refresh (backfill is rate‑limited) and verify partitions in `data/hyperliquid/parquet`.

