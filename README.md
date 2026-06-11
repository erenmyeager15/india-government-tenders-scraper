# India Government Tenders Scraper - GeM Leads

Scrape Indian government tender leads for B2B sales and procurement research. The actor uses the public GeM bid listing AJAX endpoint to collect live bid opportunities by keyword, department/ministry, status, and bid-end date filters. It deduplicates by tender ID and saves a clean one-row-per-tender dataset for CRMs, market intelligence workflows, and downstream enrichment.

CPPP support is guarded: the public CPPP listing currently presents a CAPTCHA before tender results. When CPPP is selected, the actor detects this and skips CPPP without pushing placeholder rows or charging `tender-scraped` events. This keeps monetization honest while preserving the input contract for future CPPP endpoint work.

## Use Cases

1. B2B lead generation for companies selling to government buyers
2. Procurement research by product or service keyword
3. Vendor opportunity tracking for active GeM bid deadlines
4. Government contract analytics by ministry and department
5. Supply chain planning around public-sector demand signals

## Input

```json
{
    "source": "gem",
    "keywords": ["laptop"],
    "state": "Maharashtra",
    "maxResults": 10,
    "proxyConfiguration": {
        "useApifyProxy": false
    }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `source` | string | `gem`, `cppp`, or `both` |
| `keywords` | string[] | Search keywords, processed sequentially |
| `department` | string | Optional ministry/department text filter |
| `state` | string | Optional state filter when exposed by source |
| `minValue` / `maxValue` | number | Applied when tender value is exposed |
| `dateFrom` / `dateTo` | string | For GeM, maps to bid end date |
| `status` | string | `active`, `closed`, or `all` |
| `maxResults` | number | Max records per keyword, up to 500 |

## Sample GeM Output

```json
{
    "source": "gem",
    "keyword": "laptop",
    "tenderId": "GEM/2026/B/7605079",
    "tenderReferenceNumber": "GEM/2026/B/7605079",
    "tenderTitle": "Annual Maintenance Service - Desktops, Laptops and Peripherals",
    "organization": "Department of Defence",
    "department": "Department of Defence",
    "ministry": "Ministry of Defence",
    "category": "Annual Maintenance Service - Desktops, Laptops and Peripherals",
    "tenderType": "bid",
    "tenderValue": null,
    "bidSubmissionStartDate": "2026-06-02T16:26:48.000Z",
    "bidSubmissionEndDate": "2026-06-12T10:00:00.000Z",
    "tenderOpenDate": null,
    "publishedDate": null,
    "closingDate": "2026-06-12T10:00:00.000Z",
    "tenderStatus": "active",
    "emdAmount": null,
    "tenderUrl": "https://bidplus.gem.gov.in/showbidDocument/9402098",
    "corrigendumCount": null,
    "scrapedAt": "2026-06-11T12:30:00.000Z"
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
| `tender-scraped` | $0.003 per clean tender record |
| 1,000 tenders | $3.00 |
| 10,000 tenders | $30.00 |

## Notes

- GeM public list feed does not expose tender value, EMD, eligibility, city, or state in the search result payload, so those fields remain `null` unless exposed by a future public endpoint.
- No placeholder rows are pushed.
- No PPE event is charged unless `Actor.pushData()` succeeds for a real tender record.
- Data is for lead generation and research, not legal or procurement advice.
