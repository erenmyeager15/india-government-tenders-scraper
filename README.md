# India Government Tenders Scraper - GeM & CPPP Portal

Scrape Indian government tender leads for B2B sales, procurement research, and public-sector opportunity tracking. The actor searches the live GeM bid listing endpoint by keyword, deduplicates tenders by ID, then enriches each GeM result from its public bid PDF when available. PDF enrichment fills practical lead fields such as publishing date, bid opening date, bid validity, organization, ministry, department, state/location hints, EMD amount, and eligibility summary. Export to JSON, CSV, Excel, or HTML, or pull via the Apify API — no login and no API key required.

The actor accepts up to 5 keywords in one run, supports up to 50 matching tenders per keyword, and saves clean records to the Apify Dataset. Filters are applied after enrichment where the public source exposes the field, so state and published-date filters use the recovered GeM detail data instead of rough listing text. A small memory-based run-start event covers source access and proxy/session setup, and per-record charging happens only after a real tender record is pushed to the dataset.

GeM currently requires Residential India proxy routing for reliable public access. The actor handles this automatically under the hood so users do not need to configure proxies manually.

CPPP support is guarded. The current public CPPP listing is CAPTCHA-gated before tender results are exposed. When CPPP is selected, the actor detects the gate, skips CPPP without placeholder rows, and does not charge `tender-scraped` events for unavailable records. This keeps the dataset honest while preserving the schema for future CPPP access improvements.

## Use Cases

1. B2B lead generation for companies selling to government buyers
2. Procurement research by product or service keyword
3. Vendor opportunity tracking for active GeM bid deadlines
4. Government contract analytics by ministry and department
5. Supply chain planning around public-sector demand signals

## How to Scrape India Government Tenders (Step by Step)

1. Click **Try for free** / **Run**.
2. Keep `source` as `gem` (CPPP is CAPTCHA-gated and skipped) and enter your search `keywords` (e.g. `laptop`).
3. Set `maxResults` per keyword (start small to test).
4. Optionally filter by `state`, `department`, `status`, value range, or date range, then click **Run**.
5. When the run finishes, export results to JSON, CSV, Excel, or HTML, or pull them via the Apify API.

## Input

```json
{
    "source": "gem",
    "keywords": ["laptop"],
    "state": "Maharashtra",
    "maxResults": 10
}
```

| Field | Type | Description |
| --- | --- | --- |
| `source` | string | `gem`, `cppp`, or `both` |
| `keywords` | string[] | Search keywords, processed sequentially |
| `department` | string | Optional ministry, department, or organization text filter |
| `state` | string | Optional state filter from enriched GeM detail PDFs |
| `minValue` / `maxValue` | number | Optional tender value range; unknown values are excluded when this filter is used |
| `dateFrom` / `dateTo` | string | Optional published-date range applied after GeM PDF enrichment |
| `status` | string | `active`, `closed`, or `all` |
| `maxResults` | number | Max matching records per keyword, up to 50 |
| Proxy routing | automatic | The actor uses Residential India proxy routing internally because GeM blocks datacenter and non-India routes |

## Sample GeM Output

```json
{
    "source": "gem",
    "keyword": "laptop",
    "tenderId": "GEM/2026/B/7605079",
    "tenderReferenceNumber": "GEM/2026/B/7605079",
    "tenderTitle": "Annual Maintenance Service - Desktops, Laptops and Peripherals",
    "organization": "Indian Coast Guard",
    "department": "Department Of Defence",
    "ministry": "Ministry Of Defence",
    "category": "Annual Maintenance Service - Desktops, Laptops and Peripherals",
    "tenderType": "bid",
    "tenderValue": null,
    "bidSubmissionStartDate": "2026-06-02T16:26:48.000Z",
    "bidSubmissionEndDate": "2026-06-12T10:00:00.000Z",
    "tenderOpenDate": "2026-06-12T10:30:00.000Z",
    "publishedDate": "2026-06-02T00:00:00.000Z",
    "closingDate": "2026-06-12T10:00:00.000Z",
    "bidValidity": "180 (Days)",
    "tenderStatus": "active",
    "city": null,
    "state": "Karnataka",
    "location": "Karnataka",
    "eligibilityCriteriaSummary": "Minimum average annual turnover: 5 Lakh (s); Past experience required: 4 Year (s); MSE relaxation: Yes | Complete",
    "emdAmount": 23000,
    "tenderDocumentFee": null,
    "tenderUrl": "https://bidplus.gem.gov.in/showbidDocument/9402098",
    "corrigendumCount": null,
    "scrapedAt": "2026-06-11T14:31:30.540Z"
}
```

## Sample CPPP Output

```json
{
    "source": "cppp",
    "keyword": "laptop",
    "tenderId": "CPPP2026_12345",
    "tenderReferenceNumber": "REF/IT/2026/01",
    "tenderTitle": "Procurement of IT Equipment",
    "organization": "Example Organisation",
    "category": "Goods",
    "tenderType": "open",
    "tenderValue": 12000000,
    "publishedDate": "2026-06-01T00:00:00.000Z",
    "closingDate": "2026-06-20T15:00:00.000Z",
    "bidValidity": "90 days",
    "emdAmount": 240000,
    "tenderDocumentFee": 5000,
    "tenderUrl": "https://eprocure.gov.in/eprocure/app",
    "corrigendumCount": 2,
    "scrapedAt": "2026-06-11T12:30:00.000Z"
}
```

The CPPP object above shows the intended schema. Current CPPP public pages are CAPTCHA-gated and are skipped unless a non-CAPTCHA source becomes available.

## Pricing

| Event | Price |
| --- | --- |
| `apify-actor-start` | $0.001 per allocated GB, minimum one event per run |
| `tender-scraped` | $0.003 per clean tender record |
| 100 tenders | $0.30 plus the small memory-based run-start charge |
| 1,000 tenders | $3.00 plus the small memory-based run-start charge |

## Notes

- GeM tender value, tender document fee, and corrigendum count are left `null` when they are not exposed by the public listing or bid PDF.
- The default Apify table view focuses on populated GeM lead fields and hides GeM-only unavailable value, fee, and corrigendum columns.
- GeM state/location is inferred from public bid PDF text when available. Records without a matched state are excluded only when a state filter is provided.
- No placeholder rows are pushed.
- Dataset saving and `tender-scraped` charging use one atomic operation. When a user's maximum charge is reached, the actor stops before making more tender or PDF-enrichment requests.
- Data is for lead generation and research, not legal or procurement advice.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.
