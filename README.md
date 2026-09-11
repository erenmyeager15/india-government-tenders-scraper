# India Government Tenders Scraper - GeM Listings

Scrape public Indian government tender opportunities for procurement research, bid monitoring, and public-sector demand tracking. The Actor searches the live GeM bid listing endpoint by keyword, deduplicates tenders by ID, then enriches each GeM result from its public bid PDF when available.

PDF enrichment fills practical opportunity fields such as publishing date, bid opening date, bid validity, organization, ministry, department, state/location hints, EMD amount, and eligibility summary. Export to JSON, CSV, Excel, or HTML, or pull via the Apify API. No login and no API key are required for the public GeM flow.

The default run is intentionally small: 1 `laptop` tender from GeM. The Actor accepts up to 5 keywords in one run, supports up to 50 matching tenders per keyword, and saves clean records to the Apify Dataset. Filters are applied after enrichment where the public source exposes the field, so state and published-date filters use recovered GeM detail data instead of rough listing text. A 10-page-per-keyword ceiling prevents restrictive filters from turning into unbounded scans.

GeM currently requires Residential India proxy routing for reliable public access. The Actor handles this internally, keeps the CSRF flow on one sticky session, and permits one capped fresh-session retry when GeM or a residential route becomes stale. Users do not need to configure proxies manually.

CPPP extraction is not implemented in this version, even when a page has no CAPTCHA. Use `source: "gem"`. The legacy `cppp` and `both` inputs remain accepted for compatibility, but cannot produce CPPP records. No placeholder CPPP rows or `tender-scraped` events are generated for them; run-start and applicable platform usage charges can still apply.

## Use Cases

1. B2B opportunity discovery for companies selling to government buyers
2. Procurement research by product or service keyword
3. Vendor opportunity tracking for active GeM bid deadlines
4. Government contract analytics by ministry and department
5. Supply chain planning around public-sector demand signals

## How to Scrape India Government Tenders

1. Click **Try for free** or **Run**.
2. Keep `source` as `gem` and enter a search keyword such as `laptop`.
3. Keep `maxResults` at `1` for the first run, then increase after the sample looks right.
4. Optionally filter by `state`, `department`, `status`, value range, or date range.
5. Export results to JSON, CSV, Excel, or HTML, or pull them via the Apify API.

## Input

```json
{
  "source": "gem",
  "keywords": ["laptop"],
  "status": "active",
  "maxResults": 1
}
```

| Field | Type | Description |
| --- | --- | --- |
| `source` | string | Use `gem` (supported). Legacy `cppp` produces no records; `both` can return only GeM records. CPPP extraction is unavailable |
| `keywords` | string[] | Search keywords, processed sequentially. Up to 5 keywords |
| `department` | string | Optional ministry, department, or organization text filter |
| `state` | string | Optional state filter from enriched GeM detail PDFs |
| `minValue` / `maxValue` | number | Optional tender value range; unknown values are excluded when this filter is used |
| `dateFrom` / `dateTo` | string | Optional published-date range applied after GeM PDF enrichment |
| `status` | string | `active`, `closed`, or `all` |
| `maxResults` | number | Max matching records per keyword, up to 50. Default is 1 for a low-cost sample |
| Proxy routing | automatic | The Actor uses Residential India proxy routing internally because GeM blocks datacenter and non-India routes |

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
  "eligibilityCriteriaSummary": "Minimum average annual turnover: 5 Lakh (s); Past experience required: 4 Year (s)",
  "emdAmount": 23000,
  "tenderDocumentFee": null,
  "tenderUrl": "https://bidplus.gem.gov.in/showbidDocument/9402098",
  "corrigendumCount": null,
  "scrapedAt": "2026-06-11T14:31:30.540Z"
}
```

## CPPP Behavior

CPPP extraction is unavailable, not merely blocked by CAPTCHA: this version has no CPPP result parser. Legacy selections may probe the public CPPP page, but never extract CPPP tenders. A probe can also fail if the source is unavailable. Select `gem` to avoid this unsupported path. The Actor does not bypass CAPTCHA or push placeholder CPPP rows. CPPP would require a future implementation and verification before it can be advertised as supported.

## Pricing

| Event | Price |
| --- | --- |
| `apify-actor-start` | $0.001 per allocated GB, minimum one event per run |
| `tender-scraped` | $0.003 per clean tender record |
| 100 tenders | $0.30 plus the memory-based run-start charge and any Apify platform usage passed through by the active pricing model |
| 1,000 tenders | $3.00 plus the memory-based run-start charge and any Apify platform usage passed through by the active pricing model |

## Notes

- GeM tender value, tender document fee, and corrigendum count are left `null` when they are not exposed by the public listing or bid PDF.
- Each GeM keyword gets an independent fresh-session recovery. If one keyword or later page remains unavailable, the Actor preserves clean tenders from other successful pages instead of failing the whole partial run. A run still fails when GeM never returns any readable search page.
- GeM state/location is inferred from public bid PDF text when available. Records without a matched state are excluded only when a state filter is provided.
- No placeholder rows are pushed.
- Dataset saving and `tender-scraped` charging use one atomic operation. When a user's maximum charge is reached, the Actor stops before making more tender or PDF-enrichment requests.
- Data is for opportunity research and monitoring, not legal, procurement, or bid-submission advice.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with source website terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. This Actor does not bypass CAPTCHA, private portals, logins, or paid government systems.
