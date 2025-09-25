'use client';

import { useEffect, useState } from 'react';

type Status = {
  db_exists: boolean;
  parquet_root: string;
  parquet_files: number;
  candles_rows: number;
  breakdown?: Array<{ coin: string; interval: string; rows: number; min_ms: number; max_ms: number }>;
  breakdown_by_source?: Array<{ src: string; coin: string; interval: string; rows: number; min_ms: number; max_ms: number }>;
};

export default function DataHealth() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [coin, setCoin] = useState<string>('BTC');
  const [interval, setInterval] = useState<string>('1m');
  const [timeSinceTick, setTimeSinceTick] = useState<number|null>(null);
  const [gapSinceDays, setGapSinceDays] = useState<number>(30);
  const [gapsBusy, setGapsBusy] = useState(false);
  const [gaps, setGaps] = useState<Array<{ coin:string; interval:string; gap_start:number; gap_end:number; bars_missing:number }>>([]);

  async function refresh() {
    const r = await fetch('/api/storage/status', { cache: 'no-store' });
    const j = await r.json();
    setSt(j);
  }

  async function initDb() {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/storage/init', { method: 'POST' });
      if (r.ok) setMsg('DuckDB initialized.');
      else setMsg('Failed to init DB.');
    } finally {
      setBusy(false);
      refresh();
    }
  }

  useEffect(() => { refresh(); }, []);

  // Live tick indicator polling
  useEffect(()=>{
    let mounted = true;
    const poll = async () => {
      try{
        const r = await fetch('/api/ingestor/status', { cache: 'no-store' });
        if (!mounted) return;
        if (r.ok) {
          const s = await r.json();
          if (s?.lastMessageTimestamp) setTimeSinceTick(Date.now() - Number(s.lastMessageTimestamp));
          else setTimeSinceTick(null);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return ()=> { mounted=false; clearInterval(id); };
  }, []);

  useEffect(()=>{
    // Initialize selectors based on breakdown when available
    if (!st?.breakdown) return;
    const coins = Array.from(new Set(st.breakdown.map(b=> b.coin)));
    const intervals = Array.from(new Set(st.breakdown.map(b=> b.interval)));
    if (coins.length && !coins.includes(coin)) setCoin(coins[0]!);
    if (intervals.length && !intervals.includes(interval)) setInterval(intervals[0]!);
  }, [st]);

  function doExport(){
    const params = new URLSearchParams({ coin, interval });
    // Navigate to API to trigger browser download
    window.location.href = `/api/data/export?${params.toString()}`;
  }

  async function refreshGaps(){
    setGapsBusy(true);
    try {
      const r = await fetch(`/api/ingestor/gaps?sinceDays=${gapSinceDays}`, { cache: 'no-store' });
      const j = await r.json();
      setGaps(Array.isArray(j?.gaps) ? j.gaps : []);
    } finally { setGapsBusy(false); }
  }

  async function fillGapsNow(){
    setGapsBusy(true);
    try {
      await fetch('/api/ingestor/fill-gaps', { method: 'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sinceDays: gapSinceDays }) });
      await refreshGaps();
    } finally { setGapsBusy(false); }
  }

  return (
    <main className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Data Health</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            timeSinceTick === null ? 'bg-neutral-600' :
            (timeSinceTick < 5000 ? 'bg-emerald-500 animate-pulse' : timeSinceTick < 15000 ? 'bg-yellow-500' : 'bg-red-500')
          }`} />
          <span className="text-sm text-neutral-400">
            {timeSinceTick === null ? 'Ingestor offline' : `Live tick: ${(timeSinceTick/1000).toFixed(1)}s ago`}
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-800 p-4 space-y-2">
        <div className="text-sm text-neutral-400">Parquet lake root:</div>
        <div className="font-mono text-sm break-all">{st?.parquet_root ?? '...'}</div>
        <div className="flex gap-6 mt-2">
          <div>Parquet files: <span className="text-emerald-400">{st?.parquet_files ?? 0}</span></div>
          <div>Candles rows (view): <span className="text-emerald-400">{st?.candles_rows ?? 0}</span></div>
          <div>DuckDB: <span className={st?.db_exists ? 'text-emerald-400' : 'text-red-400'}>{st?.db_exists ? 'present' : 'missing'}</span></div>
        </div>
        <div className="mt-4 flex gap-3">
          {!st?.db_exists && (
            <button onClick={initDb} disabled={busy} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">
              {busy ? 'Working…' : 'Initialize DuckDB'}
            </button>
          )}
          <button onClick={refresh} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Refresh</button>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm">Coin</label>
            <select value={coin} onChange={e=>setCoin(e.target.value)} className="bg-neutral-900 rounded px-2 py-1 text-sm">
              {Array.from(new Set(st?.breakdown?.map(b=> b.coin) ?? ['BTC'])).map(c=> (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label className="text-sm">Interval</label>
            <select value={interval} onChange={e=>setInterval(e.target.value)} className="bg-neutral-900 rounded px-2 py-1 text-sm">
              {Array.from(new Set(st?.breakdown?.map(b=> b.interval) ?? ['1m'])).map(i=> (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            <button onClick={doExport} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm">Export CSV</button>
          </div>
        </div>
        {msg && <div className="text-neutral-400 text-sm mt-2">{msg}</div>}
      </div>
      <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
        <div className="text-sm text-neutral-400">Per-interval breakdown</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left font-medium pr-4">Coin</th>
                <th className="text-left font-medium pr-4">Interval</th>
                <th className="text-right font-medium pr-4">Rows</th>
                <th className="text-left font-medium">Range (local)</th>
              </tr>
            </thead>
            <tbody>
              {st?.breakdown?.map((b, idx) => (
                <tr key={idx} className="border-t border-neutral-800">
                  <td className="py-2 pr-4 font-mono">{b.coin}</td>
                  <td className="py-2 pr-4 font-mono">{b.interval}</td>
                  <td className="py-2 pr-4 text-right">{b.rows}</td>
                  <td className="py-2">
                    {b.min_ms && b.max_ms ? `${new Date(b.min_ms).toLocaleString()} → ${new Date(b.max_ms).toLocaleString()}` : '-'}
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={4} className="py-2 text-neutral-400">No data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
        <div className="text-sm text-neutral-400">Per-source breakdown</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left font-medium pr-4">Source</th>
                <th className="text-left font-medium pr-4">Coin</th>
                <th className="text-left font-medium pr-4">Interval</th>
                <th className="text-right font-medium pr-4">Rows</th>
                <th className="text-left font-medium">Range (local)</th>
              </tr>
            </thead>
            <tbody>
              {st?.breakdown_by_source?.map((b, idx) => (
                <tr key={idx} className="border-t border-neutral-800">
                  <td className="py-2 pr-4 font-mono">{b.src}</td>
                  <td className="py-2 pr-4 font-mono">{b.coin}</td>
                  <td className="py-2 pr-4 font-mono">{b.interval}</td>
                  <td className="py-2 pr-4 text-right">{b.rows}</td>
                  <td className="py-2">
                    {b.min_ms && b.max_ms ? `${new Date(b.min_ms).toLocaleString()} → ${new Date(b.max_ms).toLocaleString()}` : '-'}
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={5} className="py-2 text-neutral-400">No data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-400">Detected Gaps (Hyperliquid)</div>
          <div className="flex items-center gap-2">
            <label className="text-sm">Lookback days</label>
            <input type="number" min={1} value={gapSinceDays} onChange={e=> setGapSinceDays(Number(e.target.value||30))} className="bg-neutral-900 rounded px-2 py-1 text-sm w-24" />
            <button onClick={refreshGaps} disabled={gapsBusy} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm">{gapsBusy? 'Checking…':'Refresh'}</button>
            <button onClick={fillGapsNow} disabled={gapsBusy} className="px-3 py-1.5 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/50 border border-emerald-800 text-emerald-200 text-sm">{gapsBusy? 'Filling…':'Fill Now'}</button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left font-medium pr-4">Coin</th>
                <th className="text-left font-medium pr-4">Interval</th>
                <th className="text-right font-medium pr-4">Bars missing</th>
                <th className="text-left font-medium">Gap range (local)</th>
              </tr>
            </thead>
            <tbody>
              {gaps.length ? gaps.map((g, idx)=> (
                <tr key={idx} className="border-t border-neutral-800">
                  <td className="py-2 pr-4 font-mono">{g.coin}</td>
                  <td className="py-2 pr-4 font-mono">{g.interval}</td>
                  <td className="py-2 pr-4 text-right">{g.bars_missing}</td>
                  <td className="py-2">{new Date(g.gap_start).toLocaleString()} → {new Date(g.gap_end).toLocaleString()}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-2 text-neutral-400">No gaps detected in lookback.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-neutral-400 text-sm">
        Tip: use the CLI to seed sample data: <code>pnpm storage:seed</code> then refresh.
      </p>
    </main>
  );
}
