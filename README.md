# Hyperlocal — Local, Signals‑Only Crypto Intelligence

Hyperlocal is a local‑only, TypeScript‑first toolkit for ingesting Hyperliquid perp market data, computing features/signals, and visualizing status in a fast, dark‑mode UI. No trading/execution/signing code — ever.

## Highlights
- Local data engine: Parquet lake + DuckDB views
- Rate‑safe Hyperliquid ingestor: WS heartbeat, backfill via `candleSnapshot`, token buckets
- Historical backfill (Binance via Python): paged klines (1000 bars), overlap‑safe, HL precedence
- Unified Explorer: infinite scroll, HL‑over‑Binance dedupe, overlays aligned to bar opens
- UI (Next.js): Data Health (with per‑source breakdown), Ingestor controls, sticky nav, dark theme
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
- `scripts/` — Python tools (e.g., `binance_backfill.py`)

## Quickstart
1) One‑command start
- `pnpm install`
- `pnpm start`
  - Starts the UI dev server on `http://localhost:3000`
  - Auto‑initializes DuckDB and views on first API request
  - Auto‑starts the ingestor (startup backfill → warmup → Binance backfill → WS live)
  - Open:
    - Explorer: `/explorer` (auto full‑history load per interval; infinite scroll; overlays)
    - Data Health: `/data-health` (lake status, per‑source breakdown, CSV export, gaps panel)
    - Ingestor: `/ingestor` (live status, message counts, startup progress)

2) (Optional) Storage helpers
- `pnpm db:init` · `pnpm storage:seed` · `pnpm storage:verify`

3) (Optional) Historical backfill from Binance (Python)
- Install: `pip install python-binance pyarrow duckdb pyyaml`
- Recommended: run HL first so earliest HL boundary exists (Ingestor → Start). Then:
  - Global: `pnpm binance:backfill -- --base-url https://api.binance.com --coins BTC --intervals 1m 5m 15m 1h 4h 1d`
  - US only: `pnpm binance:backfill -- --base-url https://api.binance.us --coins BTC --intervals 1m 5m 15m 1h 4h 1d`
- Notes:
  - Only pulls bars older than the earliest Hyperliquid bar (per `{coin,interval}`), and stops before any existing Binance bars → no overlap/duplicates.
  - Writes Parquet with `src='binance'`. UI/API dedupe uses HL when both exist for the same timestamp.

Notes & Behavior
- Startup backfill respects HL rate weights and windows (≤3000 bars). It retries ms→sec and normalizes response shapes to ensure full history.
- Storage partitions: `data/hyperliquid/parquet/{coin}/{interval}/date=YYYY-MM-DD/*.parquet` (UTC date). DuckDB views read the lake with Hive partitioning.
- Testnet: override `configs/local.config.yaml` → `ws.url: wss://api.hyperliquid-testnet.xyz/ws`.
- Explorer: infinite scroll (candles + features) and auto‑hydration to full history per interval; dedupe at API ensures HL precedence; Binance fills older gaps. Newly fetched bars extend the left viewport as you scroll.
- Data Health: per‑source breakdown, CSV export by coin/interval, live tick indicator, and a Gaps panel with on‑demand “Fill Now”.
- Ingestor: 
  - Startup: Hyperliquid backfill → feature warmup → Binance historical backfill, then WS live.
  - Gap protection: detects and fills gaps mid‑session; scans periodically (15m) and fills any holes; exposes one‑click fill via API/UI.

## Scripts
- `pnpm start` — starts UI and auto‑starts the ingestor (recommended for dev)
- `pnpm run ci` — typecheck, lint, tests, forbidden‑symbols scan
- `pnpm --filter @hyperlocal/storage test` — storage tests
- `pnpm --filter @hyperlocal/ingestor test` — ingestor tests
- `pnpm binance:backfill` — run Python Binance historical backfill

## How It Works
- Ingestor (Hyperliquid)
  - Startup: gap‑aware REST backfill (windowed, rate‑limited), feature warmup, Binance historical backfill, then WS live (candles/trades/book/BBO) with heartbeats.
  - Mid‑session: live gap detection with targeted backfill; periodic gap scans.
  - Features: computed from HL candles; aligned to bar opens (RSI/EWVol/ATR/Stoch/CVD, etc.).
- Storage
  - Parquet lake partitioned by `{coin}/{interval}/date=YYYY-MM-DD/` with schema: `src, coin, interval, open_time, close_time, o/h/l/c, volume, trade_count, vwap, date`.
  - DuckDB views: `candles_pq` (raw), `candles_pq_ordered` (TIMESTAMP columns for open/close).
- Binance historical (Python)
  - Pulls klines in 1000‑bar pages backward from `(earliest HL open − 1 ms)`; stops before earliest Binance bar to avoid overlap.
  - Writes Parquet with `src='binance'` (keeps provenance and prevents interference).
- UI + APIs
  - Candles API merges sources with HL precedence per `open_time`, returns seconds `t` via `epoch(open_time)`.
  - Features API aligns indicator timestamps to bar opens; supports `before` for paging.
  - Explorer: infinite scroll + auto full‑history, live tick indicator; Data Health shows per‑source breakdown, CSV export, gaps panel.

See also: RUNBOOK.md for daily operations.

## Safety & Guardrails
- Signals‑only policy enforced by `scripts/forbidden-check.cjs` (CI fails on trading/execution symbols)
- No keys/secrets expected; all data remains local

## Troubleshooting
- Prefer dev mode for the UI (`pnpm --filter ui dev`). Some environments can show harmless build warnings for optional `ws` addons.
- If Data Health shows low rows after Start, wait and Refresh (backfill is rate‑limited) and verify partitions in `data/hyperliquid/parquet`.
- If python‑binance errors on restricted location for `.com`, pass `--base-url https://api.binance.us` (script auto‑falls back).
- If `configs/local.config.yaml` has YAML errors, the Python script will warn and continue with defaults; you can run with CLI flags only.
