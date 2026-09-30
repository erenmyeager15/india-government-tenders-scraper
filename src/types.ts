export type TenderSource = 'gem' | 'cppp' | 'both';
export type TenderStatus = 'active' | 'closed' | 'all';

export interface ActorInput {
    source?: TenderSource;
    keywords?: string[];
    department?: string;
    state?: string;
    minValue?: number;
    maxValue?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: TenderStatus;
    maxResults?: number;
    /** Enables persistent comparison when a saved watchlist name is provided. */
    watchlistName?: string;
    proxyConfiguration?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
        apifyProxyCountry?: string;
    };
}

export interface NormalizedInput {
    source: TenderSource;
    keywords: string[];
    department: string | null;
    state: string | null;
    minValue: number | null;
    maxValue: number | null;
    dateFrom: string | null;
    dateTo: string | null;
    status: TenderStatus;
    maxResults: number;
    watchlistName: string | null;
    proxyConfiguration?: ActorInput['proxyConfiguration'];
}

export interface TenderRecord {
    source: 'gem' | 'cppp';
    keyword: string;
    tenderId: string;
    tenderReferenceNumber: string | null;
    tenderTitle: string | null;
    organization: string | null;
    department: string | null;
    ministry: string | null;
    category: string | null;
    tenderType: string | null;
    tenderValue: number | null;
    bidSubmissionStartDate: string | null;
    bidSubmissionEndDate: string | null;
    tenderOpenDate: string | null;
    publishedDate: string | null;
    closingDate: string | null;
    bidValidity: string | null;
    tenderStatus: string | null;
    city: string | null;
    state: string | null;
    location: string | null;
    eligibilityCriteriaSummary: string | null;
    emdAmount: number | null;
    tenderDocumentFee: number | null;
    tenderUrl: string | null;
    corrigendumCount: number | null;
    scrapedAt: string;
}

export interface FieldEvidence {
    source: 'gem_listing' | 'gem_bid_pdf';
    url: string;
    excerpt?: string;
}

export interface GemObservation {
    record: TenderRecord;
    evidence: Partial<Record<keyof TenderRecord, FieldEvidence>>;
    pdfStatus: 'read' | 'failed' | 'unavailable';
}

export interface GemScanDiagnostics {
    complete: boolean;
    successfulPages: number;
    issues: Array<{ keyword: string; reason: 'search_failed' | 'pdf_failed' | 'page_limit' | 'spending_limit' | 'invalid_record' }>;
    keywords: Array<{ keyword: string; coverage: 'exhausted' | 'result_limit' | 'incomplete'; pages: number }>;
}
