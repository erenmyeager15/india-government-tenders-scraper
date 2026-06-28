import { Actor, log } from 'apify';
import { scrapeTenders, isChargeableTender, normalizeInput } from './routes.js';
import { ActorInput, TenderRecord } from './types.js';

const STORAGE_PUSH_RETRY_ATTEMPTS = 3;

await Actor.init();

try {
    const input = ((await Actor.getInput()) ?? {}) as ActorInput;
    const normalizedInput = normalizeInput(input);

    log.info(
        `Starting tender scrape: source=${normalizedInput.source}, keywords=${normalizedInput.keywords.join(', ')}, maxResults=${normalizedInput.maxResults}`,
    );

    let pushed = 0;
    let stoppedByChargeLimit = false;

    await scrapeTenders(input, async (record) => {
        if (!isChargeableTender(record)) return true;

        const result = await pushAndCharge(record);
        if (result.saved) pushed += 1;
        if (result.stopped) {
            stoppedByChargeLimit = true;
            log.warning('User spending limit reached. Stopping before any more tender requests or enrichment work.');
            return false;
        }
        return true;
    });

    if (pushed === 0 && !stoppedByChargeLimit) {
        log.warning('No clean tender records were pushed. No tender-scraped events were charged.');
    } else {
        log.info(`Saved ${pushed} tender records${stoppedByChargeLimit ? ' before reaching the user spending limit' : ''}.`);
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Actor failed: ${message}`);
    await Actor.fail(`Actor failed: ${message}`);
}

await Actor.exit();

async function pushAndCharge(record: TenderRecord): Promise<{ saved: boolean; stopped: boolean }> {
    const chargeResult = await Actor.charge({ eventName: 'tender-scraped', count: 1 });
    const recordWasCharged = chargeResult.chargedCount > 0 || !chargeResult.eventChargeLimitReached;
    if (!recordWasCharged) {
        return { saved: false, stopped: true };
    }

    for (let attempt = 1; attempt <= STORAGE_PUSH_RETRY_ATTEMPTS; attempt++) {
        try {
            await Actor.pushData(record);
            return { saved: true, stopped: chargeResult.eventChargeLimitReached };
        } catch (err) {
            if (attempt === STORAGE_PUSH_RETRY_ATTEMPTS) {
                throw new Error(`Dataset push failed for tender "${record.tenderTitle}": ${(err as Error).message}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
    }

    return { saved: false, stopped: true };
}
