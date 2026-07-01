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
