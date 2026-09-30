import { Actor, log } from 'apify';
import { createGemScanDiagnostics, scrapeTenders, isChargeableTender, normalizeInput } from './routes.js';
import { ActorInput, GemObservation, TenderRecord } from './types.js';
import { wasPushedRecordSaved } from './billing.js';
import { finalizeWatchlist } from './monitoring.js';
import { openWatchlistStorage } from './monitoring-storage.js';
import { randomUUID } from 'node:crypto';

await Actor.init();

try {
    const input = ((await Actor.getInput()) ?? {}) as ActorInput;
    const normalizedInput = normalizeInput(input);
    const scanStartedAt = new Date().toISOString();
    const runId = Actor.getEnv().actorRunId ?? randomUUID();
    const diagnostics = createGemScanDiagnostics();
    const observations: GemObservation[] = [];
    const watchlistStorage = normalizedInput.watchlistName ? await openWatchlistStorage(normalizedInput.watchlistName) : null;

    log.info(
        `Starting tender scrape: source=${normalizedInput.source}, keywords=${normalizedInput.keywords.join(', ')}, maxResults=${normalizedInput.maxResults}`,
    );

    let pushed = 0;
    let stoppedByChargeLimit = false;

    try {
        await scrapeTenders(input, async (record, observation) => {
            if (!isChargeableTender(record)) return true;

            const result = await pushAndCharge(record);
            if (result.saved) {
                pushed += 1;
                if (watchlistStorage && observation) observations.push(observation);
            }
            if (result.stopped) {
                stoppedByChargeLimit = true;
                await Actor.setStatusMessage(`Stopped at the user's spending limit after ${pushed} tenders`);
                log.warning('User spending limit reached. Stopping before any more tender requests or enrichment work.');
                return false;
            }
            return true;
        }, { diagnostics });
    } catch (error) {
        diagnostics.complete = false;
        if (watchlistStorage && normalizedInput.watchlistName) await finalizeWatchlist(watchlistStorage, {
            watchlistName: normalizedInput.watchlistName, input: normalizedInput, observations, diagnostics,
            runId, scanStartedAt, now: new Date().toISOString(),
        });
        throw error;
    }
    if (watchlistStorage && normalizedInput.watchlistName) {
        const summary = await finalizeWatchlist(watchlistStorage, {
            watchlistName: normalizedInput.watchlistName, input: normalizedInput, observations, diagnostics,
            runId, scanStartedAt, now: new Date().toISOString(),
        });
        log.info(`GeM watchlist ${summary.status}: ${summary.changes.length} changes; baseline committed=${summary.baselineCommitted}. Summary: GEM-CHANGES.`);
    }

    if (pushed === 0 && !stoppedByChargeLimit) {
        log.warning('No clean tender records were pushed. No tender-scraped events were charged.');
    } else {
        if (!stoppedByChargeLimit) {
            await Actor.setStatusMessage(`Finished with ${pushed} tender records`);
        }
        log.info(`Saved ${pushed} tender records${stoppedByChargeLimit ? ' before reaching the user spending limit' : ''}.`);
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Actor failed: ${message}`);
    await Actor.fail(`Actor failed: ${message}`);
}

await Actor.exit();

async function pushAndCharge(record: TenderRecord): Promise<{ saved: boolean; stopped: boolean }> {
    const chargeResult = await Actor.pushData(record, 'tender-scraped');
    return {
        saved: wasPushedRecordSaved(chargeResult),
        stopped: chargeResult.eventChargeLimitReached === true,
    };
}
