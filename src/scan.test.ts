import assert from 'node:assert/strict';
import test from 'node:test';
import { createGemScanDiagnostics, gemListingEvidence, normalizeInput, scrapeTenders, validateGemSearchResponse, type GemScanRuntime, type GemSearchResponse } from './routes.js';
import type { GemObservation, TenderRecord } from './types.js';

test('saved watchlists are opt-in, validate names, and reject unsupported CPPP-only monitoring', () => {
    assert.equal(normalizeInput({ watchlistName: ' laptop-watch ' }).watchlistName, 'laptop-watch');
    assert.equal(normalizeInput({ watchlistName: '  ' }).watchlistName, null);
    for (const name of ['../state', '-invalid', 'a'.repeat(51), 'buyer watch']) {
        assert.throws(() => normalizeInput({ watchlistName: name }), /watchlistName must contain/);
    }
    assert.throws(() => normalizeInput({ watchlistName: 'watch', source: 'cppp' }), /GeM only/);
});

function doc(id = 1, overrides: Record<string, unknown> = {}) {
    return { b_id: id, b_bid_number: `GEM/2026/B/${id}`, bd_category_name: 'Laptop Computers', b_status: 1, ...overrides };
}

function page(docs: Record<string, unknown>[] = [doc()], total = docs.length, start = 0): GemSearchResponse {
    return { code: 200, response: { response: { docs, numFound: total, start } } };
}

function mockRuntime(overrides: Partial<GemScanRuntime> = {}) {
    const calls: string[] = [];
    const runtime: GemScanRuntime = {
        async openSession(reason) { calls.push(`open:${reason}`); return { csrfToken: 'synthetic-token', cookie: '' }; },
        async closeSession() { calls.push('close'); },
        async fetchPage(_session, _status, keyword, number) { calls.push(`page:${keyword}:${number}`); return page(); },
        async enrich(record) { calls.push(`pdf:${record.tenderId}`); return { record, evidence: gemListingEvidence(record), pdfStatus: 'read' }; },
        async delay() {},
        ...overrides,
    };
    return { runtime, calls };
}

test('overlapping keywords emit a bid once and reuse its successful PDF observation', async () => {
    const { runtime, calls } = mockRuntime();
    const diagnostics = createGemScanDiagnostics();
    const saved: GemObservation[] = [];
    const records = await scrapeTenders({ keywords: ['laptop', 'computer'] }, async (_record, observation) => {
        saved.push(observation!); return true;
    }, { diagnostics, gemRuntime: runtime });
    assert.equal(records.length, 1);
    assert.equal(saved.length, 1);
    assert.equal(calls.filter((call) => call.startsWith('pdf:')).length, 1);
    assert.equal(diagnostics.complete, true);
    assert.equal(diagnostics.keywords.length, 2);
    assert.ok(diagnostics.keywords.every((item) => item.coverage === 'result_limit'));
});

test('fresh-session recovery completes a scan; persistent late-page failure preserves records and marks partial', async () => {
    let failedOnce = false;
    const recovered = mockRuntime({
        async fetchPage() {
            if (!failedOnce) { failedOnce = true; throw new Error('synthetic session failure'); }
            return page();
        },
    });
    const complete = createGemScanDiagnostics();
    assert.equal((await scrapeTenders({}, undefined, { diagnostics: complete, gemRuntime: recovered.runtime })).length, 1);
    assert.equal(complete.complete, true);
    assert.equal(recovered.calls.filter((call) => call.startsWith('open:')).length, 2);
    assert.equal(recovered.calls.filter((call) => call === 'close').length, 2);

    const partial = mockRuntime({
        async fetchPage(_session, _status, _keyword, number) {
            if (number === 1) return page([doc()], 2);
            throw new Error('synthetic failed later page');
        },
    });
    const diagnostics = createGemScanDiagnostics();
    assert.equal((await scrapeTenders({ maxResults: 2 }, undefined, { diagnostics, gemRuntime: partial.runtime })).length, 1);
    assert.equal(diagnostics.complete, false);
    assert.deepEqual(diagnostics.issues, [{ keyword: 'laptop', reason: 'search_failed' }]);
    assert.equal(diagnostics.keywords[0].coverage, 'incomplete');
});

test('one failed keyword cannot poison a scan with another successful keyword; zero readable pages still fail', async () => {
    const partial = mockRuntime({
        async fetchPage(_session, _status, keyword) {
            if (keyword === 'printer') throw new Error('synthetic unavailable keyword');
            return page();
        },
    });
    const diagnostics = createGemScanDiagnostics();
    const result = await scrapeTenders({ keywords: ['laptop', 'printer'] }, undefined, { diagnostics, gemRuntime: partial.runtime });
    assert.equal(result.length, 1);
    assert.equal(diagnostics.complete, false);
    assert.equal(diagnostics.keywords[1].coverage, 'incomplete');
    const failed = mockRuntime({ async openSession() { throw new Error('synthetic proxy failure'); } });
    const noPages = createGemScanDiagnostics();
    await assert.rejects(scrapeTenders({}, undefined, { diagnostics: noPages, gemRuntime: failed.runtime }), /did not return a readable search page/);
    assert.equal(noPages.complete, false);
    assert.equal(noPages.successfulPages, 0);
});

test('failed PDF enrichment can save a useful listing but makes monitoring incomplete', async () => {
    const { runtime } = mockRuntime({
        async enrich(record) { return { record, evidence: gemListingEvidence(record), pdfStatus: 'failed' }; },
    });
    const diagnostics = createGemScanDiagnostics();
    assert.equal((await scrapeTenders({}, undefined, { diagnostics, gemRuntime: runtime })).length, 1);
    assert.equal(diagnostics.complete, false);
    assert.deepEqual(diagnostics.issues, [{ keyword: 'laptop', reason: 'pdf_failed' }]);
});

test('spending-limit callback stops before more pages, keywords, or PDF work and marks the saved final row partial', async () => {
    const { runtime, calls } = mockRuntime({ async fetchPage() { return page([doc(1), doc(2)], 2); } });
    const diagnostics = createGemScanDiagnostics();
    const confirmedSaved: TenderRecord[] = [];
    await scrapeTenders({ keywords: ['laptop', 'printer'], maxResults: 2 }, async (record) => {
        confirmedSaved.push(record); return false;
    }, { diagnostics, gemRuntime: runtime });
    assert.equal(confirmedSaved.length, 1);
    assert.equal(calls.filter((call) => call.startsWith('pdf:')).length, 1);
    assert.equal(diagnostics.keywords.length, 1);
    assert.equal(diagnostics.complete, false);
    assert.deepEqual(diagnostics.issues, [{ keyword: 'laptop', reason: 'spending_limit' }]);
});

test('page ceiling under restrictive filters is partial, while complete empty search is safe', async () => {
    let pages = 0;
    const { runtime } = mockRuntime({
        async fetchPage(_session, _status, _keyword, number) { pages += 1; return page([doc(number)], 20, number - 1); },
    });
    const diagnostics = createGemScanDiagnostics();
    assert.deepEqual(await scrapeTenders({ department: 'non-matching department' }, undefined, { diagnostics, gemRuntime: runtime }), []);
    assert.equal(pages, 10);
    assert.equal(diagnostics.complete, false);
    assert.deepEqual(diagnostics.issues, [{ keyword: 'laptop', reason: 'page_limit' }]);
    const empty = mockRuntime({ async fetchPage() { return page([]); } });
    const safe = createGemScanDiagnostics();
    assert.deepEqual(await scrapeTenders({}, undefined, { diagnostics: safe, gemRuntime: empty.runtime }), []);
    assert.equal(safe.complete, true);
    assert.equal(safe.keywords[0].coverage, 'exhausted');
});

test('invalid listing shape or bid identity cannot initialize a misleading baseline', async () => {
    for (const response of [{ code: 200 }, { response: { response: { docs: [], numFound: 10 } } }, { response: { response: { docs: [null], numFound: 1 } } }, page([doc()], 0)]) {
        assert.throws(() => validateGemSearchResponse(response as GemSearchResponse), /invalid search-result shape/);
    }
    const malformed = mockRuntime({ async fetchPage() { return { code: 200 }; } });
    const failed = createGemScanDiagnostics();
    await assert.rejects(scrapeTenders({}, undefined, { diagnostics: failed, gemRuntime: malformed.runtime }), /did not return a readable search page/);
    assert.equal(failed.complete, false);
    const invalid = mockRuntime({ async fetchPage() { return page([{ bd_category_name: 'Laptop Computers' }]); } });
    const diagnostics = createGemScanDiagnostics();
    assert.deepEqual(await scrapeTenders({}, undefined, { diagnostics, gemRuntime: invalid.runtime }), []);
    assert.deepEqual(diagnostics.issues, [{ keyword: 'laptop', reason: 'invalid_record' }]);
});
