import { loadConfig } from '@hyperlocal/core';

export default function Settings() {
  const cfg = loadConfig();
  return (
    <main className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>
      <pre className="rounded-xl border border-neutral-800 p-4 overflow-auto text-sm">
        {JSON.stringify(cfg, null, 2)}
      </pre>
      <p className="text-neutral-400">
        Settings are sourced from <code>configs/default.config.yaml</code> plus your local overrides.
        The UI will eventually let you edit &amp; save overrides.
      </p>
    </main>
  );
}

