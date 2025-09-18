'use client';

import { useEffect, useState } from 'react';

type Status = {
  db_exists: boolean;
  parquet_root: string;
  parquet_files: number;
  candles_rows: number;
};

export default function DataHealth() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');

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

  return (
    <main className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Data Health</h2>
      <div className="rounded-xl border border-neutral-800 p-4 space-y-2">
        <div className="text-sm text-neutral-400">Parquet lake root:</div>
        <div className="font-mono text-sm break-all">{st?.parquet_root ?? '...'}</div>
        <div className="flex gap-6 mt-2">
          <div>Parquet files: <span className="text-emerald-400">{st?.parquet_files ?? 0}</span></div>
          <div>Candles rows (view): <span className="text-emerald-400">{st?.candles_rows ?? 0}</span></div>
          <div>DuckDB: <span className={st?.db_exists ? 'text-emerald-400' : 'text-red-400'}>{st?.db_exists ? 'present' : 'missing'}</span></div>
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={initDb} disabled={busy} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">
            {busy ? 'Working…' : 'Initialize DuckDB'}
          </button>
          <button onClick={refresh} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Refresh</button>
        </div>
        {msg && <div className="text-neutral-400 text-sm mt-2">{msg}</div>}
      </div>
      <p className="text-neutral-400 text-sm">
        Tip: use the CLI to seed sample data: <code>pnpm storage:seed</code> then refresh.
      </p>
    </main>
  );
}

