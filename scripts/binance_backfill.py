#!/usr/bin/env python3
"""
Binance backfill: pull OHLCV older than existing Hyperliquid history, as far back as possible.

Best practices implemented:
- Uses python-binance /api/v3/klines with 1000-bar paging, walking backward from the earliest HL bar.
- Respects rate limits with a configurable sleep and backoff on 429/5xx.
- Avoids overlap with existing Binance rows by stopping at the earliest existing Binance bar.
- Writes Parquet files partitioned by UTC date, with a schema compatible with the Node writer.
- Reads configs/default.config.yaml + configs/local.config.yaml (and HYPERLOCAL_CONFIG) to resolve storage_root, universe, intervals, and binance.base_url.

Usage (from repo root):
  python3 scripts/binance_backfill.py

Optional flags:
  --base-url https://api.binance.com     # override (default from config or .com)
  --sleep-ms 200                         # inter-call sleep (ms)
  --coins BTC ETH                        # override coins
  --intervals 1m 5m 15m 1h 4h 1d         # override intervals
  --symbol-map "BTC:BTCUSDT,ETH:ETHUSDT"  # override mapping
"""

import os, sys, time, argparse, datetime as dt, json
from typing import Dict, List, Tuple

try:
  import yaml  # pyyaml
except ImportError:
  yaml = None

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
from binance.client import Client
from binance.exceptions import BinanceAPIException
from urllib.error import HTTPError


INTERVAL_MS = {'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}

INTERVAL_MAP = {
    '1m': Client.KLINE_INTERVAL_1MINUTE,
    '5m': Client.KLINE_INTERVAL_5MINUTE,
    '15m': Client.KLINE_INTERVAL_15MINUTE,
    '1h': Client.KLINE_INTERVAL_1HOUR,
    '4h': Client.KLINE_INTERVAL_4HOUR,
    '1d': Client.KLINE_INTERVAL_1DAY,
}


def find_configs_root(start: str) -> str:
  cur = os.path.abspath(start)
  fs_root = os.path.abspath(os.sep)
  while True:
    candidate = os.path.join(cur, 'configs', 'default.config.yaml')
    if os.path.exists(candidate):
      return os.path.join(cur, 'configs')
    parent = os.path.dirname(cur)
    if parent == cur or cur == fs_root:
      break
    cur = parent
  return ''


def load_config() -> dict:
  # Merge default + local + env override
  cfg_root = find_configs_root(os.getcwd())
  merged = {}
  paths = []
  if cfg_root:
    paths.append(os.path.join(cfg_root, 'default.config.yaml'))
    lp = os.path.join(cfg_root, 'local.config.yaml')
    if os.path.exists(lp):
      paths.append(lp)
  if os.environ.get('HYPERLOCAL_CONFIG'):
    paths.append(os.path.abspath(os.environ['HYPERLOCAL_CONFIG']))
  if not yaml:
    return merged
  for p in paths:
    if os.path.exists(p):
      try:
        with open(p, 'r') as f:
          y = yaml.safe_load(f) or {}
          if not isinstance(y, dict):
            print(f"[warn] Ignoring non-mapping YAML in {p}")
          else:
            merged.update(y)
      except Exception as e:
        print(f"[warn] Failed to parse YAML {p}: {e}. Proceeding with defaults.")
  return merged


def ymd_utc(ms: int) -> str:
  d = dt.datetime.utcfromtimestamp(ms / 1000.0)
  return d.strftime('%Y-%m-%d')


def ensure_view(con: duckdb.DuckDBPyConnection, parquet_root: str):
  # DuckDB doesn't allow parameters in DDL. Embed the path and escape quotes.
  pr = parquet_root.replace("'", "''")
  sql = f"""
    CREATE OR REPLACE VIEW candles_pq AS
    SELECT * FROM read_parquet('{pr}/**/*.parquet', hive_partitioning=true);
  """
  con.execute(sql)


def earliest_open_ms(con: duckdb.DuckDBPyConnection, src: str, coin: str, interval: str) -> int:
  q = (
    "SELECT MIN(open_time) AS m FROM candles_pq WHERE src=? AND coin=? AND interval=?"
  )
  r = con.execute(q, [src, coin, interval]).fetchone()
  return int(r[0]) if r and r[0] is not None else -1


def group_rows_by_date(rows: List[list]) -> Dict[str, List[list]]:
  g: Dict[str, List[list]] = {}
  for r in rows:
    date = ymd_utc(int(r[0]))
    g.setdefault(date, []).append(r)
  return g


def write_parquet_group(storage_root: str, coin: str, interval: str, date: str, rows: List[list]):
  if not rows:
    return
  out_dir = os.path.join(storage_root, 'parquet', coin, interval, f'date={date}')
  os.makedirs(out_dir, exist_ok=True)
  src = ['binance'] * len(rows)
  coins = [coin] * len(rows)
  itv = [interval] * len(rows)
  open_time = [int(r[0]) for r in rows]
  open_ = [float(r[1]) for r in rows]
  high = [float(r[2]) for r in rows]
  low = [float(r[3]) for r in rows]
  close = [float(r[4]) for r in rows]
  volume = [float(r[5]) for r in rows]
  close_time = [int(r[6]) for r in rows]
  num_trades = [int(r[8]) for r in rows]
  vwap = [None] * len(rows)
  dates = [date] * len(rows)
  table = pa.table({
      'src': pa.array(src, type=pa.string()),
      'coin': pa.array(coins, type=pa.string()),
      'interval': pa.array(itv, type=pa.string()),
      'open_time': pa.array(open_time, type=pa.int64()),
      'close_time': pa.array(close_time, type=pa.int64()),
      'open': pa.array(open_, type=pa.float64()),
      'high': pa.array(high, type=pa.float64()),
      'low': pa.array(low, type=pa.float64()),
      'close': pa.array(close, type=pa.float64()),
      'volume': pa.array(volume, type=pa.float64()),
      'trade_count': pa.array(num_trades, type=pa.int64()),
      'vwap': pa.array(vwap, type=pa.float64()),
      'date': pa.array(dates, type=pa.string()),
  })
  first = open_time[0]
  last = open_time[-1]
  fname = f'chunk-{first}-{last}.parquet'
  out_path = os.path.join(out_dir, fname)
  pq.write_table(table, out_path)


def main():
  # Some package managers pass a literal "--" to scripts. Remove it.
  if '--' in sys.argv:
    sys.argv = [a for a in sys.argv if a != '--']
  ap = argparse.ArgumentParser()
  ap.add_argument('--base-url', default=None, help='Binance REST base; default from config or https://api.binance.com')
  ap.add_argument('--sleep-ms', type=int, default=200)
  ap.add_argument('--coins', nargs='+', default=None)
  ap.add_argument('--intervals', nargs='+', default=None)
  ap.add_argument('--symbol-map', default=None, help='CSV mapping, e.g. BTC:BTCUSDT,ETH:ETHUSDT')
  args, unknown = ap.parse_known_args()
  if unknown:
    print(f"[warn] Ignoring unknown args: {' '.join(unknown)}")

  cfg = load_config()
  storage_root = os.path.abspath(cfg.get('storage_root', './data/hyperliquid'))
  parquet_root = os.path.join(storage_root, 'parquet')
  duck_path = os.path.join(storage_root, 'hyperliquid.duckdb')

  coins = args.coins or cfg.get('universe', ['BTC'])
  intervals = args.intervals or cfg.get('intervals', ['1m','5m','15m','1h','4h','1d'])
  # Resolve base URL: prefer CLI, then config.binance.base_url, then .com
  base_url = args.base_url or (cfg.get('binance', {}) or {}).get('base_url') or 'https://api.binance.com'

  # Optional map from config: binance.symbol_map: { BTC: BTCUSDT, ... }
  symbol_map = {}
  cfg_map = (cfg.get('binance', {}) or {}).get('symbol_map')
  if isinstance(cfg_map, dict):
    symbol_map.update({str(k): str(v) for k, v in cfg_map.items()})
  if args.symbol_map:
    for pair in args.symbol_map.split(','):
      k, v = pair.split(':', 1)
      symbol_map[k.strip()] = v.strip()

  # Ensure lake dirs exist to avoid glob issues
  os.makedirs(parquet_root, exist_ok=True)
  os.makedirs(storage_root, exist_ok=True)

  con = duckdb.connect(duck_path)
  ensure_view(con, parquet_root)

  # Initialize client targeting the correct TLD; fall back to 'us' if 'com' is restricted.
  tld = 'us' if 'binance.us' in base_url else 'com'
  try:
    client = Client(tld=tld)
  except Exception as e:
    msg = str(e).lower()
    if 'restricted location' in msg and tld == 'com':
      print(f"[warn] Restricted on binance.com, falling back to binance.us")
      client = Client(tld='us')
      base_url = 'https://api.binance.us'
    else:
      raise

  for coin in coins:
    for interval in intervals:
      # Boundary: start from earliest HL minus 1ms. Stop at earliest existing Binance to avoid overlap.
      hl_min = earliest_open_ms(con, 'hyperliquid', coin, interval)
      if hl_min < 0:
        print(f"[skip] No HL baseline for {coin} {interval}")
        continue
      bn_min = earliest_open_ms(con, 'binance', coin, interval)
      end_ms = hl_min - 1
      earliest_stop = bn_min - 1 if bn_min > 0 else -1
      dur = INTERVAL_MS[interval]
      api_interval = INTERVAL_MAP[interval]
      symbol = symbol_map.get(coin, f'{coin}USDT')

      print(f"[start] {coin} {interval} symbol={symbol} base={base_url} end_ms={end_ms} stop_at={earliest_stop if earliest_stop>0 else '∞'}")

      backoff = 0.0
      while end_ms > 0 and (earliest_stop <= 0 or end_ms > earliest_stop):
        start_ms = max(0, end_ms - dur*1000 + 1)
        try:
          k = client.get_klines(symbol=symbol, interval=api_interval, startTime=start_ms, endTime=end_ms, limit=1000)
        except Exception as e:
          # Backoff on transient errors
          backoff = min(5.0, (backoff + 0.5) if backoff else 1.0)
          print(f"[error] {coin} {interval} window {start_ms}-{end_ms}: {e}; backoff={backoff}s")
          time.sleep(backoff)
          continue

        if not k:
          print(f"[empty] {coin} {interval} {start_ms}-{end_ms} — reached start or no data")
          break

        # Group rows by UTC date and write one Parquet per date
        groups = group_rows_by_date(k)
        total = 0
        for date, rows in groups.items():
          write_parquet_group(storage_root, coin, interval, date, rows)
          total += len(rows)
        print(f"[write] {coin} {interval} rows={total} {start_ms}-{end_ms}")

        if len(k) < 1000:
          # Likely at start of history
          print(f"[done] {coin} {interval} hit start ({len(k)} < 1000)")
          break
        end_ms = start_ms - 1
        time.sleep(max(0.0, args.sleep_ms/1000.0))

  con.close()


if __name__ == '__main__':
  main()
