# Promotion Notes - India Government Tenders Scraper

Use this only lightly until monitor data stays clean after the Residential India restore.

## Positioning

- Public GeM tender opportunity monitoring.
- Keyword-based procurement research for businesses that already sell into government buyers.
- Structured exports for weekly tender review sheets.

## Short Post

I polished my India Government Tenders Scraper on Apify.

It searches public GeM tender listings by keyword, enriches records from public bid PDFs when available, and exports clean fields like tender ID, title, organization, department, ministry, deadlines, state/location hints, EMD, eligibility summary, and source URL.

Default run is small: 1 `laptop` tender from GeM. CPPP is guarded because the public listing is CAPTCHA-gated, so it skips unavailable CPPP pages instead of pushing placeholder rows.

## Video Outline

1. Open the Actor and show the one-result GeM sample.
2. Run keyword `laptop` with `maxResults: 1`.
3. Show the tender table fields and dataset export.
4. Explain Residential India routing and CPPP guarded behavior.
5. End with a reminder to verify tender details on the official source before acting.

## Do Not Claim

- Do not claim official GeM, CPPP, or Government of India API access.
- Do not claim CAPTCHA bypass.
- Do not claim complete coverage of every Indian tender.
- Do not claim legal, procurement, bid-writing, or compliance advice.
- Do not promote as personal-data collection.
- Do not promote heavily until monitor stays clean.

## Reliability Notes (measured 2026-09-15, build 1.0.28)
- 30-day public run stats before this fix: 505 SUCCEEDED, 16 FAILED, 6 ABORTED (527 total). Customer run logs are not readable via the API; use Console Insights > Debugging for exact failure messages.
- Datacenter proxy was probed against `bidplus.gem.gov.in` and the connection is refused (`Request was cancelled`) for both `country-IN` and no-country datacenter sessions. Residential India is the only working route, so the cost playbook's "datacenter first" tier does not apply here.
- Hardened fatal paths: Residential proxy config failure now reports an actionable message; the GeM session is opened lazily per keyword (4 attempts each, backoff) instead of once per run; page fetch retries raised to 3 with exponential backoff and a 35 s timeout; a failing CPPP listing fetch can no longer fail a run that already collected GeM records.
- Measured cost: $0.006316 per run for 4 records over 2 keywords (~$0.00158 per record). Residential proxy transfer is ~70% of the run cost. Net revenue per record at $0.003 list is $0.0024.
