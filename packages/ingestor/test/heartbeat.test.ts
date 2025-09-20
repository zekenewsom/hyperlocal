import { describe, it, expect } from 'vitest';
import { HlWsClient } from '../src/ws-client.js';

// We monkey-patch ws send using a fake instance by overriding private methods via any-cast.
describe('ws heartbeat ping', () => {
  it('sends ping after idle interval', async () => {
    const sent: any[] = [];
    const c = new HlWsClient('ws://example', 0, ()=>{}, ()=>{});
    (c as any).ws = { readyState: 1, send: (s: string)=> sent.push(JSON.parse(s)) };
    (c as any).sendLimiter = { take: ()=> true };
    (c as any).lastOutbound = Date.now() - 60_000; // idle
    c['ping']();
    expect(sent[0]).toEqual({ method: 'ping' });
  });
});

