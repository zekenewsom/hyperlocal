'use client';
import { useEffect, useState } from 'react';

type St = {
  running: boolean;
  ws: { url: string; connected: boolean; lastPing?: number; lastPong?: number; outboundMsgs: number; subs: number; };
  msgs: { candles: number; trades: number; books: number; bbo: number; pong: number; subAcks: number; };
  backfill: Array<{ source?: string; coin: string; interval: string; windowsPlanned: number; windowsDone: number; rows: number; }>;
};

export default function IngestorPage() {
  const [st, setSt] = useState<St | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  async function refresh() {
    const r = await fetch('/api/ingestor/status', { cache: 'no-store' });
    setSt(await r.json());
  }

  async function start() { setBusy(true); await fetch('/api/ingestor/start', { method:'POST' }); setBusy(false); refresh(); }
  async function stop() { setBusy(true);  await fetch('/api/ingestor/stop', { method:'POST' }); setBusy(false); refresh(); }

  useEffect(()=>{ refresh(); }, []);

  return (
    <main className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Ingestor</h2>
      <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
        <div className="flex gap-3">
          <button onClick={start} disabled={busy || st?.running} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Start</button>
          <button onClick={stop} disabled={busy || !st?.running} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Stop</button>
          <button onClick={refresh} className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700">Refresh</button>
          <button
            onClick={async ()=>{
              setResetBusy(true);
              try {
                await fetch('/api/storage/reset-1m', { method: 'POST' });
                await refresh();
              } finally { setResetBusy(false); }
            }}
            disabled={resetBusy}
            className="px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-900/60 border border-red-800 text-red-200"
          >{resetBusy ? 'Resetting 1m…' : 'Reset 1m Lake + Backfill'}</button>
        </div>
        <div className="text-sm text-neutral-400">WS URL: {st?.ws?.url ?? '-'}</div>
        <div className="flex gap-6">
          <div>Connected: <span className={st?.ws?.connected ? 'text-emerald-400' : 'text-red-400'}>{st?.ws?.connected ? 'yes' : 'no'}</span></div>
          <div>Subs: <span className="text-emerald-400">{st?.ws?.subs ?? 0}</span></div>
          <div>Outbound msgs: <span className="text-emerald-400">{st?.ws?.outboundMsgs ?? 0}</span></div>
          <div>Last ping: <span className="text-neutral-300">{st?.ws?.lastPing ? new Date(st.ws.lastPing).toLocaleTimeString() : '-'}</span></div>
          <div>Last pong: <span className="text-neutral-300">{st?.ws?.lastPong ? new Date(st.ws.lastPong).toLocaleTimeString() : '-'}</span></div>
        </div>
        <div className="text-sm text-neutral-400">Message counts (since start):</div>
        <div className="grid grid-cols-6 gap-4">
          {['candles','trades','books','bbo','pong','subAcks'].map((k)=>(
            <div key={k} className="rounded-lg bg-neutral-900 p-3">
              <div className="text-xs text-neutral-400">{k}</div>
              <div className="text-lg">{(st?.msgs as any)?.[k] ?? 0}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-sm text-neutral-400">Backfill progress (startup)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {st?.backfill?.map((b,i)=>(
              <div key={i} className="rounded-lg bg-neutral-900 p-3">
                <div className="font-mono text-sm">
                  <span className="px-1.5 py-0.5 mr-2 rounded text-xs border border-neutral-700 bg-neutral-800">{b.source ?? 'hl'}</span>
                  {b.coin} · {b.interval}
                </div>
                <div className="text-xs text-neutral-400">windows: {b.windowsDone}/{b.windowsPlanned}</div>
                <div className="text-xs text-neutral-400">rows: {b.rows}</div>
              </div>
            )) ?? <div className="text-neutral-400 text-sm">No progress yet.</div>}
          </div>
        </div>
      </div>
      <p className="text-neutral-400 text-sm">Uses Hyperliquid WS + info endpoints. Heartbeats every 45s; rate-limited backfill windows of ≤3000 candles.</p>
    </main>
  );
}
