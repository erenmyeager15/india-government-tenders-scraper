import assert from 'node:assert/strict';
import test from 'node:test';
import { isChargeableTender, normalizeInput } from './routes.js';
import type { TenderRecord } from './types.js';

test('normalizes to the low-cost GeM default', () => {
    const input = normalizeInput({});

    assert.equal(input.source, 'gem');
    assert.deepEqual(input.keywords, ['laptop']);
    assert.equal(input.status, 'active');
    assert.equal(input.maxResults, 1);
});

test('trims, deduplicates, and caps keywords', () => {
    const input = normalizeInput({
        keywords: [' laptop ', 'laptop', 'printer', 'router', 'scanner', 'server', ''],
        maxResults: 500,
    });

    assert.deepEqual(input.keywords, ['laptop', 'printer', 'router', 'scanner', 'server']);
    assert.equal(input.maxResults, 50);
});

test('falls back from invalid enum and numeric API values', () => {
    const input = normalizeInput({
        source: 'bad-source' as never,
        status: 'bad-status' as never,
        maxResults: 'not-a-number' as never,
        minValue: -10,
    });

    assert.equal(input.source, 'gem');
    assert.equal(input.status, 'active');
    assert.equal(input.maxResults, 1);
    assert.equal(input.minValue, null);
});

test('rejects impossible value and date ranges before requests', () => {
    assert.throws(() => normalizeInput({ minValue: 100, maxValue: 10 }), /minValue cannot be greater than maxValue/);
    assert.throws(() => normalizeInput({ dateFrom: '2026-07-10', dateTo: '2026-07-01' }), /dateFrom cannot be after dateTo/);
});

test('identifies chargeable tender records only when title and id exist', () => {
    const record = {
        tenderId: 'GEM/2026/B/7605079',
        tenderTitle: 'Laptop procurement',
    } as TenderRecord;

    assert.equal(isChargeableTender(record), true);
    assert.equal(isChargeableTender({ ...record, tenderTitle: null }), false);
    assert.equal(isChargeableTender({ ...record, tenderId: '' }), false);
});
