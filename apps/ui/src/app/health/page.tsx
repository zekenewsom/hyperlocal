import { loadConfig } from '@hyperlocal/core';

export default function Health() {
  const cfg = loadConfig();
  return (
    <main className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Health</h2>
      <div className="rounded-xl border border-neutral-800 p-4">
        <div>Mode: <span className="text-emerald-400">Signals-only</span></div>
        <div>Theme: {cfg.ui.theme}</div>
        <div>Timezone: {cfg.ui.timezone}</div>
        <div>WS URL: {cfg.ws.url}</div>
        <div>Universe: {cfg.universe.join(', ')}</div>
        <div>Intervals: {cfg.intervals.join(', ')}</div>
      </div>
      <p className="text-neutral-400">This page will later show live WS health and rate budgets.</p>
    </main>
  );
}

