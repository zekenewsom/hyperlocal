import { describe, it, expect } from 'vitest';
import { HlWsClient } from '../src/ws-client.js';
// We monkey-patch ws send using a fake instance by overriding private methods via any-cast.
describe('ws heartbeat ping', () => {
    it('sends ping after idle interval', async () => {
        const sent = [];
        const c = new HlWsClient('ws://example', 0, () => { }, () => { });
        c.ws = { readyState: 1, send: (s) => sent.push(JSON.parse(s)) };
        c.sendLimiter = { take: () => true };
        c.lastOutbound = Date.now() - 60_000; // idle
        c['ping']();
        expect(sent[0]).toEqual({ method: 'ping' });
    });
});
