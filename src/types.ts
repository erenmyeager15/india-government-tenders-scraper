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
