import { Actor } from 'apify';
import { createHash, randomUUID } from 'node:crypto';
import { CHANGE_SUMMARY_KEY, WATCHLIST_STATE_KEY, type WatchlistStorage } from './monitoring.js';

/** A single pending queue item provides an API-owned lock; no source URL is fetched. */
export async function openWatchlistStorage(watchlistName: string): Promise<WatchlistStorage> {
    if (!Actor.isAtHome()) {
        throw new Error('Saved GeM watchlists require an Apify platform run. Omit watchlistName for a local scrape; local monitoring tests use injected storage.');
    }
    // Short, non-retried API calls keep a state write comfortably inside the lease.
    const client = Actor.newClient({ maxRetries: 0, timeoutSecs: 30 });
    const suffix = createHash('sha256').update(watchlistName).digest('hex').slice(0, 32);
    const store = await client.keyValueStores().getOrCreate(`gem-watchlist-${suffix}`);
    const queue = await client.requestQueues().getOrCreate(`gem-watchlist-lock-${suffix}`);
    const queueClient = client.requestQueue(queue.id, { clientKey: randomUUID().replace(/-/g, '') });
    const item = await queueClient.addRequest({
        uniqueKey: 'gem-watchlist-state-writer-v1',
        url: 'https://bidplus.gem.gov.in/all-bids',
    });
    if (item.wasAlreadyHandled) {
        throw new Error('The saved GeM watchlist lock item was marked handled. Restore its pending state or use a new watchlistName.');
    }
    const storeClient = client.keyValueStore(store.id);
    return {
        async acquireLock() {
            const result = await queueClient.listAndLockHead({ lockSecs: 300, limit: 1 });
            const request = result.items.find((entry) => entry.id === item.requestId);
            return request?.id ?? null;
        },
        async assertLock(lockId) {
            // The API rejects a renewal after ownership has moved to another client.
            await queueClient.prolongRequestLock(lockId, { lockSecs: 300 });
        },
        async releaseLock(lockId) {
            await queueClient.deleteRequestLock(lockId);
        },
        async read() {
            return (await storeClient.getRecord(WATCHLIST_STATE_KEY))?.value ?? null;
        },
        async write(state) {
            await storeClient.setRecord({ key: WATCHLIST_STATE_KEY, value: JSON.stringify(state), contentType: 'application/json' }, { timeoutSecs: 30, doNotRetryTimeouts: true });
        },
        async publish(summary) {
            await Actor.setValue(CHANGE_SUMMARY_KEY, summary);
        },
    };
}
