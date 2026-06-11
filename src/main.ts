import { Actor, log } from 'apify';
import { scrapeTenders, isChargeableTender, normalizeInput } from './routes.js';
import { ActorInput, TenderRecord } from './types.js';

await Actor.init();

try {
    const input = ((await Actor.getInput()) ?? {}) as ActorInput;
    const normalizedInput = normalizeInput(input);

    log.info(
        `Starting tender scrape: source=${normalizedInput.source}, keywords=${normalizedInput.keywords.join(', ')}, maxResults=${normalizedInput.maxResults}`,
    );

    const records = await scrapeTenders(input);
    let pushed = 0;

    for (const record of records) {
        if (!isChargeableTender(record)) continue;
        await pushAndCharge(record);
        pushed += 1;
    }

    if (pushed === 0) {
        log.warning('No clean tender records were pushed. No tender-scraped events were charged.');
    } else {
        log.info(`Saved ${pushed} tender records.`);
    }
} catch (error) {
    log.error(`Actor failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
} finally {
    await Actor.exit();
}

async function pushAndCharge(record: TenderRecord): Promise<void> {
    await Actor.pushData(record);
    try {
        await Actor.charge({ eventName: 'tender-scraped' });
    } catch (error) {
        log.warning(
            `Saved ${record.source}:${record.tenderId}, but local/PPE charging failed: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}
