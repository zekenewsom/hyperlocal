#!/usr/bin/env node
// One-command starter: runs UI dev server and auto-starts the ingestor when ready
import { spawn } from 'node:child_process';
import process from 'node:process';

const UI_CMD = ['--filter', 'ui', 'dev'];

function delay(ms){ return new Promise(res=> setTimeout(res, ms)); }

async function waitForUi(url, timeoutMs=60_000){
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return true;
    } catch {}
    await delay(500);
  }
  return false;
}

async function main(){
  console.log('[start] launching UI dev server...');
  const child = spawn('pnpm', UI_CMD, { stdio: 'inherit', env: process.env });

  child.on('exit', (code)=>{
    console.log(`[start] UI process exited with code ${code}`);
    process.exit(code ?? 0);
  });

  const base = process.env.HL_UI_ORIGIN || 'http://localhost:3000';
  const statusUrl = `${base}/api/ingestor/status`;
  const startUrl = `${base}/api/ingestor/start`;

  console.log('[start] waiting for UI to become ready...');
  const ok = await waitForUi(statusUrl, 90_000);
  if (!ok) {
    console.warn('[start] UI did not become ready in time; leaving server running');
    return;
  }
  try {
    // Kick off ingestor
    console.log('[start] starting ingestor...');
    const r = await fetch(startUrl, { method: 'POST' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    console.log('[start] ingestor started');
  } catch (e) {
    console.warn('[start] failed to start ingestor automatically:', e?.message || e);
  }
}

main().catch((e)=>{ console.error('[start] fatal', e); process.exit(1); });

