# India Government Tenders Scraper - GeM Listings

Scrape public Indian government tender opportunities for procurement research, bid monitoring, and public-sector demand tracking. The Actor searches the live GeM bid listing endpoint by keyword, deduplicates tenders by ID, then enriches each GeM result from its public bid PDF when available.

PDF enrichment fills practical opportunity fields such as publishing date, bid opening date, bid validity, organization, ministry, department, state/location hints, EMD amount, and eligibility summary. Export to JSON, CSV, Excel, or HTML, or pull via the Apify API. No login and no API key are required for the public GeM flow.

The default run is intentionally small: 1 `laptop` tender from GeM. The Actor accepts up to 5 keywords in one run, supports up to 50 matching tenders per keyword, and saves clean records to the Apify Dataset. Filters are applied after enrichment where the public source exposes the field, so state and published-date filters use recovered GeM detail data instead of rough listing text. A 10-page-per-keyword ceiling prevents restrictive filters from turning into unbounded scans.

An optional `watchlistName` saves a GeM baseline across Apify platform runs and produces a separate `GEM-CHANGES` report. Repeated scrapes still save and charge every clean tender, including unchanged bids; unchanged suppression applies only to the change report.

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
| `status` | string | `active`, `closed`, or `all`. Currently `all` uses the same ongoing GeM listing as `active`; it does not combine active and closed listings |
| `maxResults` | number | Max matching records per keyword, up to 50. Default is 1 for a low-cost sample |
| `watchlistName` | string | Optional persistent GeM watchlist on the Apify platform. 1–50 letters, numbers, `_` or `-`, starting with a letter or number. Reuse the name for later comparisons |
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

## Saved GeM Watchlists

Run on the Apify platform with a `watchlistName`, then reuse that name and input on later runs or an Apify schedule. Local watchlist runs are unsupported; omit the name for a local scrape. [examples/watchlist-input.json](examples/watchlist-input.json) contains this example:

```json
{
  "source": "gem",
  "keywords": ["laptop", "printer"],
  "status": "active",
  "maxResults": 10,
  "watchlistName": "illustrative-govt-it"
}
```

Each watchlist name uses a named key-value store and a request queue for a short baseline commit lock. Names are case-sensitive. Both storage names end in the first 32 characters of the name's SHA-256 hash (`gem-watchlist-…` and `gem-watchlist-lock-…`). The store's `GEM-WATCHLIST-STATE` record holds one bounded snapshot, keyed by search scope: normalized keywords, department/state/value/date filters, status, and `maxResults`. Reordering keywords or changing their case does not create a new scope. Changing a filter or result limit creates a separate baseline within the watchlist. Use separate names for independent watchlists. Keep the queue's single lock request pending; it is a storage lock, not a source crawl.

The first safe scan of each scope initializes its baseline without emitting new-bid events. A safe scan covers the configured matching-result window per keyword, or reaches the end of that keyword's listing. Reaching `maxResults` is normal bounded coverage, not a census of GeM. A newly observed bid means it was absent from the retained baseline; it does not prove the bid was just published. Bids that disappear from the window are never marked removed or closed.

Later safe scans report `newly_observed_bid` and `updated_bid` events in `GEM-CHANGES`, stored in the run's default key-value store. Updates require both the previous and current field values to be known and backed by GeM listing or bid-PDF evidence. Newly available fields, missing values, timestamps, keyword overlap, and differences in case or whitespace do not produce updates. Material fields include deadlines, status, title/category, buyer details, eligibility, bid validity, amounts, location, URL, and explicit corrigendum counts. Compared text is clipped to 1,000 characters, so differences beyond that limit are not detected.

A corrigendum-count update requires an explicit `Corrigendum Count` or `Number of Corrigenda` count label. The ordinary listing/PDF often exposes no count, so `corrigendumCount` remains `null`. Deadline or status updates alone are not labeled corrigenda. This feature does not monitor a general corrigendum endpoint.

Any search failure, PDF failure, page safety cap, spending stop, or invalid tender record makes the scan incomplete. The Actor preserves clean Dataset rows already saved, but withholds all change events and leaves the baseline unchanged. Review the report's `scan.issues`, fix the cause if needed, and run again.

| Report status | Meaning |
| --- | --- |
| `initialized` | A safe result window created the first baseline for this scope; no events |
| `compared` | A safe result window was compared and committed; `changes` may be empty |
| `incomplete` | Coverage or evidence was incomplete; no events or baseline update |
| `stale_scan` | A newer scan already committed for this scope; this scan cannot replace it |
| `concurrent_run` | Another run held the commit lock; comparison was withheld. Retry on a future normal run |

Events have deterministic `eventId` values; downstream consumers should deduplicate by that ID. A prepared report is saved with `baselineCommitted: false` before the state commit, followed by the final report with `baselineCommitted: true`. An interrupted or failed commit can leave the prepared report available and cause the events to reappear on retry. Retrying the most recently committed run with the same run ID replays its saved report (`replayed: true`). The feature writes a report; it does not deliver email or webhook notifications or promise exactly-once delivery. Every run still saves and charges all clean Dataset tenders, regardless of whether `changes` is empty; retries can repeat Dataset rows and charges.

Retention is limited to 90 days, 500 bids per scope, 10 scopes per watchlist, and 4 MiB for the total saved state. Size pressure can evict older scopes or bids earlier. Evictions do not emit events; a previously evicted bid can appear newly observed when it returns, and an evicted scope must initialize again. No unbounded per-run history or raw PDF text is retained.

[examples/change-summary.json](examples/change-summary.json) is an illustrative, synthetic report showing a deadline update and a newly observed bid. Its bids, dates, URLs, IDs, and evidence are examples, not live observations.

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

- GeM tender value, tender document fee, and corrigendum count are left `null` when they are not exposed by the public listing or bid PDF. Corrigendum counts require an explicit count label.
- Each GeM keyword gets an independent fresh-session recovery. If one keyword or later page remains unavailable, the Actor preserves clean tenders from other successful pages instead of failing the whole partial run. A run still fails when GeM never returns any readable search page.
- GeM state/location is inferred from public bid PDF text when available. Records without a matched state are excluded only when a state filter is provided.
- No placeholder rows are pushed.
- Dataset saving and `tender-scraped` charging use one atomic operation. When a user's maximum charge is reached, the Actor stops before making more tender or PDF-enrichment requests.
- Data is for opportunity research and monitoring, not legal, procurement, or bid-submission advice.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with source website terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. This Actor does not bypass CAPTCHA, private portals, logins, or paid government systems.
