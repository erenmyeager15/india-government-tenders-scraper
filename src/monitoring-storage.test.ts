import assert from 'node:assert/strict';
import test from 'node:test';
import { Actor } from 'apify';
import { openWatchlistStorage } from './monitoring-storage.js';
import { compareWatchlist, type ChangeSummary } from './monitoring.js';
import { createGemScanDiagnostics, normalizeInput } from './routes.js';

test('local saved-watchlist use fails before making storage or source requests', async (t) => {
    t.mock.method(Actor, 'isAtHome', () => false);
    const client = t.mock.method(Actor, 'newClient', () => { throw new Error('should not create a cloud client'); });
    await assert.rejects(openWatchlistStorage('synthetic-local'), /Apify platform run/);
    assert.equal(client.mock.callCount(), 0);
});

test('cloud storage adapter uses one unhandled queue item, owner-specific locks, bounded API calls, and JSON state', async (t) => {
    t.mock.method(Actor, 'isAtHome', () => true);
    const calls: Array<{ operation: string; value?: unknown }> = [];
    let lockAvailable = false;
    let handled = false;
    let savedValue: unknown;
    const queueClient = {
        async addRequest(value: unknown) { calls.push({ operation: 'add', value }); return { requestId: 'synthetic-lock', wasAlreadyHandled: handled }; },
        async listAndLockHead(value: unknown) { calls.push({ operation: 'acquire', value }); return { items: lockAvailable ? [{ id: 'synthetic-lock' }] : [] }; },
        async prolongRequestLock(id: string, value: unknown) { calls.push({ operation: 'renew', value: { id, options: value } }); },
        async deleteRequestLock(id: string) { calls.push({ operation: 'release', value: id }); },
    };
    const fakeClient = {
        keyValueStores() { return { async getOrCreate(name: string) { calls.push({ operation: 'store', value: name }); return { id: 'synthetic-store' }; } }; },
        requestQueues() { return { async getOrCreate(name: string) { calls.push({ operation: 'queue', value: name }); return { id: 'synthetic-queue' }; } }; },
        requestQueue(id: string, value: unknown) { calls.push({ operation: 'queue-client', value: { id, options: value } }); return queueClient; },
        keyValueStore(id: string) {
            assert.equal(id, 'synthetic-store');
            return {
                async getRecord(key: string) { calls.push({ operation: 'read', value: key }); return savedValue ? { value: savedValue } : undefined; },
                async setRecord(record: { key: string; value: string; contentType: string }, options: unknown) {
                    calls.push({ operation: 'write', value: { record, options } }); savedValue = JSON.parse(record.value);
                },
            };
        },
    };
    const clientMock = t.mock.method(Actor, 'newClient', (options: unknown) => {
        assert.deepEqual(options, { maxRetries: 0, timeoutSecs: 30 });
        return fakeClient as never;
    });
    t.mock.method(Actor, 'setValue', async (key: string, value: unknown) => { calls.push({ operation: 'publish', value: { key, value } }); });
    const storage = await openWatchlistStorage('synthetic-watch');
    assert.equal(clientMock.mock.callCount(), 1);
    assert.match(calls.find((item) => item.operation === 'store')!.value as string, /^gem-watchlist-[a-f0-9]{32}$/);
    assert.match(calls.find((item) => item.operation === 'queue')!.value as string, /^gem-watchlist-lock-[a-f0-9]{32}$/);
    const clientOptions = calls.find((item) => item.operation === 'queue-client')!.value as { options: { clientKey: string } };
    // The real Apify API accepts client keys only up to 32 characters.
    assert.match(clientOptions.options.clientKey, /^[a-f0-9]{32}$/);
    assert.deepEqual(calls.find((item) => item.operation === 'add')!.value, {
        uniqueKey: 'gem-watchlist-state-writer-v1', url: 'https://bidplus.gem.gov.in/all-bids',
    });
    assert.equal(await storage.acquireLock(), null);
    lockAvailable = true;
    assert.equal(await storage.acquireLock(), 'synthetic-lock');
    assert.deepEqual(calls.find((item) => item.operation === 'acquire')!.value, { lockSecs: 300, limit: 1 });
    await storage.assertLock('synthetic-lock');
    assert.deepEqual(calls.find((item) => item.operation === 'renew')!.value, { id: 'synthetic-lock', options: { lockSecs: 300 } });
    assert.equal(await storage.read(), null);
    const diagnostics = createGemScanDiagnostics();
    diagnostics.keywords = [{ keyword: 'laptop', coverage: 'exhausted', pages: 1 }];
    const result = compareWatchlist(null, {
        watchlistName: 'synthetic-watch', input: normalizeInput({}), observations: [], diagnostics,
        runId: 'synthetic-run', scanStartedAt: '2026-09-30T00:00:00Z', now: '2026-09-30T00:01:00Z',
    });
    await storage.write(result.state);
    assert.deepEqual(await storage.read(), result.state);
    await storage.publish(result.summary);
    await storage.releaseLock('synthetic-lock');
    const write = calls.find((item) => item.operation === 'write')!.value as { record: { key: string; contentType: string }; options: unknown };
    assert.equal(write.record.key, 'GEM-WATCHLIST-STATE');
    assert.equal(write.record.contentType, 'application/json');
    assert.deepEqual(write.options, { timeoutSecs: 30, doNotRetryTimeouts: true });
    const publish = calls.find((item) => item.operation === 'publish')!.value as { key: string; value: ChangeSummary };
    assert.equal(publish.key, 'GEM-CHANGES');
    assert.equal(publish.value.status, 'initialized');
    handled = true;
    await assert.rejects(openWatchlistStorage('synthetic-watch'), /lock item was marked handled/);
});
