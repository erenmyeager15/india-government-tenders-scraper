import { Actor, log } from 'apify';
import { scrapeTenders, isChargeableTender, normalizeInput } from './routes.js';
import { ActorInput, TenderRecord } from './types.js';
import { wasPushedRecordSaved } from './billing.js';

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
            await Actor.setStatusMessage(`Stopped at the user's spending limit after ${pushed} tenders`);
            log.warning('User spending limit reached. Stopping before any more tender requests or enrichment work.');
            return false;
        }
        return true;
    });

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
