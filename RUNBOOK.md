# Hyperlocal Runbook — Daily Operations

This runbook summarizes how to operate the system end‑to‑end to ingest Hyperliquid data, extend older history with Binance, verify storage, and explore results.

## Prerequisites
- Node 20 + pnpm 9 installed; repo bootstrapped with `pnpm install`.
- Python 3.10+ and pip (for Binance backfill):
  - `pip install python-binance pyarrow duckdb pyyaml`

## 1) Initialize Storage
- Create DuckDB + views:
  - `pnpm db:init`
- Optional seed (for demo):
  - `pnpm storage:seed`
- Verify lake/rows:
  - `pnpm storage:verify`

## 2) Start Hyperliquid Ingestor
- Run UI: `pnpm --filter ui dev` → open `http://localhost:3000`.
- Go to `/ingestor` and click Start.
- What happens:
  - Gap‑aware backfill (windowed, token‑bucket rate limiting), then WS live with heartbeats.
  - Features engine warms up from recent HL candles so RSI/EWVol are stable.

## 3) Extend Older History with Binance (Python)
- Recommended (global):
  - `pnpm binance:backfill -- --base-url https://api.binance.com --coins BTC --intervals 1m 5m 15m 1h 4h 1d`
- If `.com` is restricted in your region, use US domain:
  - `pnpm binance:backfill -- --base-url https://api.binance.us --coins BTC --intervals 1m 5m 15m 1h 4h 1d`
- Notes:
  - The script pulls klines in 1000‑bar pages backward from `(earliest HL open − 1 ms)` per series.
  - It stops before the earliest existing Binance bar to avoid overlap/duplicates.
  - Writes Parquet with `src='binance'` alongside HL files.
  - Default sleep 200 ms between calls (~300 req/min). If you see 429s, use `--sleep-ms 300`.
  - Default symbol mapping is `{coin}USDT` (e.g., BTC→BTCUSDT). Override with `--symbol-map "BTC:BTCUSD"` if needed.

## 4) Verify Storage Health
- Data Health page: `/data-health`
  - Per‑interval breakdown shows total rows/ranges.
  - Per‑source breakdown shows HL vs Binance rows/ranges so you can confirm older history is present.

## 5) Explore Data
- Explorer page: `/explorer`
  - Pick coin and interval; pan left.
  - Infinite scroll auto‑loads older candles and features; HL has precedence on overlaps; Binance fills earlier periods.
  - RSI/EWVol overlays align to bar opens. Overlays are computed from HL bars (by design).

## Troubleshooting
- DuckDB errors: Re‑run `pnpm db:init`. Ensure `data/hyperliquid/parquet` exists.
- Restricted location: If `.com` fails, use `--base-url https://api.binance.us`.
- YAML parse warnings in Python: The script will continue with defaults; pass flags directly if your local YAML is malformed.
- Rate limits: Increase `--sleep-ms` to 300–400. Script uses simple backoff on transient errors.
- Duplicates/overlaps: The Python backfill is overlap‑safe and stops before existing Binance rows.

## Operational Tips
- Always run HL backfill first (via `/ingestor` Start). This establishes the earliest HL boundary that drives the Python backfill range.
- Use Data Health per‑source breakdown to decide whether to run more Binance backfill for specific intervals.
- For large, deep loads on small intervals, consider running Python backfill overnight (it is rate‑safe and idempotent).

