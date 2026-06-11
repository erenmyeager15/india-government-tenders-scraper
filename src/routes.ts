import { Actor, log } from 'apify';
import { ProxyAgent } from 'undici';
import { ActorInput, NormalizedInput, TenderRecord, TenderStatus } from './types.js';

type JsonObject = Record<string, unknown>;

const GEM_BASE_URL = 'https://bidplus.gem.gov.in';
const CPPP_ACTIVE_URL = 'https://eprocure.gov.in/eprocure/app?page=FrontEndLatestActiveTenders&service=page';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 25000;
const MAX_RETRIES = 3;

interface GemSession {
    csrfToken: string;
    cookie: string;
    dispatcher?: ProxyAgent;
}

interface GemSearchResponse {
    status?: number;
    code?: number;
    message?: string;
    response?: {
        response?: {
            numFound?: number;
            start?: number;
            docs?: JsonObject[];
        };
    };
}

export function normalizeInput(input: ActorInput | null): NormalizedInput {
    const keywords = [...new Set((input?.keywords?.length ? input.keywords : ['laptop']).map((keyword) => keyword.trim()).filter(Boolean))];
    return {
        source: input?.source ?? 'gem',
        keywords,
        department: cleanString(input?.department),
        state: cleanString(input?.state),
        minValue: finiteNumber(input?.minValue),
        maxValue: finiteNumber(input?.maxValue),
        dateFrom: cleanString(input?.dateFrom),
        dateTo: cleanString(input?.dateTo),
        status: input?.status ?? 'active',
        maxResults: Math.max(1, Math.min(500, Math.trunc(input?.maxResults ?? 100))),
        proxyConfiguration: input?.proxyConfiguration,
    };
}

export async function scrapeTenders(rawInput: ActorInput | null): Promise<TenderRecord[]> {
    const input = normalizeInput(rawInput);
    const records: TenderRecord[] = [];

    if (input.source === 'gem' || input.source === 'both') {
        records.push(...(await scrapeGem(input)));
    }

    if (input.source === 'cppp' || input.source === 'both') {
        records.push(...(await scrapeCpppGuarded(input)));
    }

    return deduplicate(records).filter(isChargeableTender);
}

export function isChargeableTender(record: TenderRecord): boolean {
    return Boolean(record.tenderId && record.tenderTitle);
}

async function scrapeGem(input: NormalizedInput): Promise<TenderRecord[]> {
    const proxyConfiguration = input.proxyConfiguration?.useApifyProxy === false
        ? undefined
        : await Actor.createProxyConfiguration({
            groups: input.proxyConfiguration?.apifyProxyGroups ?? ['RESIDENTIAL'],
        });

    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
    log.info(`GeM network mode: ${proxyUrl ? 'Apify Proxy enabled' : 'direct connection'}`);
    const session = await createGemSession(proxyUrl);
    const records: TenderRecord[] = [];

    for (const keyword of input.keywords) {
        let page = 1;
        let scrapedForKeyword = 0;

        while (scrapedForKeyword < input.maxResults) {
            await randomDelay();
            const data = await fetchGemPage(session, input, keyword, page);
            const docs = data.response?.response?.docs ?? [];
            const total = data.response?.response?.numFound ?? docs.length;

            log.info(`GeM keyword="${keyword}" page=${page}: ${docs.length} docs, total=${total}`);
            if (docs.length === 0) break;

            for (const doc of docs) {
                if (scrapedForKeyword >= input.maxResults) break;
                const record = mapGemDoc(doc, keyword);
                if (!passesClientFilters(record, input)) continue;
                records.push(record);
                scrapedForKeyword += 1;
            }

            const start = data.response?.response?.start ?? (page - 1) * docs.length;
            if (start + docs.length >= total) break;
            page += 1;
        }
    }

    return records;
}

async function createGemSession(proxyUrl: string | undefined): Promise<GemSession> {
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    const response = await fetchWithRetries(`${GEM_BASE_URL}/all-bids`, {
        headers: baseGemHeaders(),
        dispatcher,
    });
    const text = await response.text();
    const csrfToken = extractCsrfToken(text);
    if (!csrfToken) {
        throw new Error('GeM CSRF token was not found on all-bids page.');
    }

    return {
        csrfToken,
        cookie: response.headers.getSetCookie?.().map((cookie) => cookie.split(';')[0]).join('; ') ?? '',
        dispatcher,
    };
}

async function fetchGemPage(session: GemSession, input: NormalizedInput, keyword: string, page: number): Promise<GemSearchResponse> {
    const payload = {
        page,
        param: {
            searchBid: keyword,
            searchType: 'fullText',
        },
        filter: buildGemFilter(input.status, input.dateFrom, input.dateTo),
    };

    const body = new URLSearchParams({
        payload: JSON.stringify(payload),
        csrf_bd_gem_nk: session.csrfToken,
    });

    const response = await fetchWithRetries(`${GEM_BASE_URL}/all-bids-data`, {
        method: 'POST',
        headers: {
            ...baseGemHeaders(),
            accept: 'application/json,text/javascript,*/*;q=0.01',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
            origin: GEM_BASE_URL,
            referer: `${GEM_BASE_URL}/all-bids`,
            ...(session.cookie ? { cookie: session.cookie } : {}),
        },
        body,
        dispatcher: session.dispatcher,
    });

    const text = await response.text();
    if (text.trim().startsWith('<')) {
        throw new Error(`GeM returned HTML instead of JSON: ${text.slice(0, 160)}`);
    }

    const data = JSON.parse(text) as GemSearchResponse;
    if (data.code !== 200) {
        throw new Error(`GeM returned code ${data.code ?? 'unknown'}: ${data.message ?? text.slice(0, 160)}`);
    }
    return data;
}

function buildGemFilter(status: TenderStatus, dateFrom: string | null, dateTo: string | null): JsonObject {
    const filter: JsonObject = {
        bidStatusType: status === 'closed' ? 'bidrastatus' : 'ongoing_bids',
        byType: 'all',
        highBidValue: '',
        byEndDate: {
            from: dateFrom ? toGemDate(dateFrom) : '',
            to: dateTo ? toGemDate(dateTo) : '',
        },
        sort: status === 'closed' ? 'Bid-End-Date-Latest' : 'Bid-End-Date-Oldest',
    };

    if (status === 'closed') {
        filter.byStatus = 'bid_awarded';
    }

    return filter;
}

function mapGemDoc(doc: JsonObject, keyword: string): TenderRecord {
    const bidId = firstNumber(doc, ['b_id'])?.toFixed(0) ?? firstString(doc, ['id']);
    const bidNumber = firstString(doc, ['b_bid_number']) ?? bidId ?? 'unknown';
    const category = firstString(doc, ['bd_category_name', 'b_category_name']);
    const ministry = firstString(doc, ['ba_official_details_minName']);
    const department = firstString(doc, ['ba_official_details_deptName']);
    const bidTypeCode = firstNumber(doc, ['b_bid_type']);

    return {
        source: 'gem',
        keyword,
        tenderId: bidNumber,
        tenderReferenceNumber: bidNumber,
        tenderTitle: category,
        organization: department,
        department,
        ministry,
        category,
        tenderType: gemBidType(bidTypeCode, doc),
        tenderValue: null,
        bidSubmissionStartDate: firstDate(doc, ['final_start_date_sort']),
        bidSubmissionEndDate: firstDate(doc, ['final_end_date_sort']),
        tenderOpenDate: null,
        publishedDate: null,
        closingDate: firstDate(doc, ['final_end_date_sort']),
        bidValidity: null,
        tenderStatus: gemStatus(firstNumber(doc, ['b_buyer_status']), firstNumber(doc, ['b_status'])),
        city: null,
        state: null,
        location: null,
        eligibilityCriteriaSummary: null,
        emdAmount: null,
        tenderDocumentFee: null,
        tenderUrl: bidId ? `${GEM_BASE_URL}/showbidDocument/${bidId}` : `${GEM_BASE_URL}/all-bids`,
        corrigendumCount: null,
        scrapedAt: new Date().toISOString(),
    };
}

async function scrapeCpppGuarded(input: NormalizedInput): Promise<TenderRecord[]> {
    const response = await fetchWithRetries(CPPP_ACTIVE_URL, {
        headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            referer: 'https://eprocure.gov.in/eprocure/app',
        },
    });
    const html = await response.text();
    if (/captcha/i.test(html)) {
        log.warning(
            'CPPP public tender listing is CAPTCHA-gated. Skipping CPPP without pushing placeholder rows or charging tender-scraped events.',
        );
        return [];
    }

    log.warning(`CPPP page did not expose a supported non-CAPTCHA data table for keywords: ${input.keywords.join(', ')}`);
    return [];
}

async function fetchWithRetries(url: string, init: FetchInitWithDispatcher = {}): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            const response = await fetch(url, { ...init, signal: controller.signal } as RequestInit & { dispatcher?: ProxyAgent });
            clearTimeout(timeout);
            if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
                throw new Error(`HTTP ${response.status} from ${url}`);
            }
            return response;
        } catch (error) {
            lastError = error;
            log.warning(`Fetch attempt ${attempt}/${MAX_RETRIES} failed for ${url}: ${errorMessage(error)}`);
            if (attempt < MAX_RETRIES) await randomDelay(1000, 3000);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function baseGemHeaders(): Record<string, string> {
    return {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'accept-language': 'en-US,en;q=0.9',
        referer: `${GEM_BASE_URL}/`,
    };
}

function extractCsrfToken(html: string): string | null {
    return (
        html.match(/'csrf_bd_gem_nk'\s*:\s*'([^']+)'/)?.[1]
        ?? html.match(/csrf_bd_gem_nk=([a-f0-9]{32})/i)?.[1]
        ?? html.match(/csrf_bd_gem_nk["']?\s*[:=]\s*["']([a-f0-9]{32})/i)?.[1]
        ?? null
    );
}

function passesClientFilters(record: TenderRecord, input: NormalizedInput): boolean {
    if (input.department) {
        const haystack = `${record.department ?? ''} ${record.ministry ?? ''} ${record.organization ?? ''}`.toLowerCase();
        if (!haystack.includes(input.department.toLowerCase())) return false;
    }

    if (input.state && record.state && !record.state.toLowerCase().includes(input.state.toLowerCase())) return false;
    if (input.minValue !== null && record.tenderValue !== null && record.tenderValue < input.minValue) return false;
    if (input.maxValue !== null && record.tenderValue !== null && record.tenderValue > input.maxValue) return false;

    return true;
}

function firstString(object: JsonObject, keys: string[]): string | null {
    for (const key of keys) {
        const value = unwrapSolrValue(object[key]);
        if (value === null || value === undefined) continue;
        const stringValue = String(value).trim();
        if (stringValue) return stringValue;
    }
    return null;
}

function firstNumber(object: JsonObject, keys: string[]): number | null {
    for (const key of keys) {
        const value = unwrapSolrValue(object[key]);
        if (value === null || value === undefined) continue;
        const cleaned = String(value).replace(/[₹,\s]/g, '').replace(/^\+/, '');
        const parsed = Number.parseFloat(cleaned);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function firstDate(object: JsonObject, keys: string[]): string | null {
    const value = firstString(object, keys);
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function unwrapSolrValue(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value;
}

function gemBidType(code: number | null, doc: JsonObject): string | null {
    if (firstNumber(doc, ['is_rc_bid']) === 1) return 'rate_contract';
    if (firstNumber(doc, ['ba_is_global_tendering']) === 1) return 'global_tender';
    if (code === 2 || code === 5) return 'reverse_auction';
    if (code === 1) return 'bid';
    return code === null ? null : `type_${code}`;
}

function gemStatus(buyerStatus: number | null, rawStatus: number | null): string | null {
    if (buyerStatus === 1) return 'technical_evaluation';
    if (buyerStatus === 2) return 'financial_evaluation';
    if (buyerStatus === 3) return 'bid_awarded';
    if (rawStatus === 1) return 'active';
    return rawStatus === null ? null : `status_${rawStatus}`;
}

function toGemDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
}

function cleanString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).trim();
    return cleaned ? cleaned : null;
}

function finiteNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

async function randomDelay(min = 1000, max = 3000): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function deduplicate(records: TenderRecord[]): TenderRecord[] {
    const seen = new Set<string>();
    return records.filter((record) => {
        const key = `${record.source}:${record.tenderId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function errorMessage(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) return `${error.message}; cause=${cause.message}`;
    if (cause) return `${error.message}; cause=${String(cause)}`;
    return error.message;
}

type FetchInitWithDispatcher = RequestInit & {
    dispatcher?: ProxyAgent;
};
