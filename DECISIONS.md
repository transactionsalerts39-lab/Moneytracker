# DECISIONS.md

## Product and architecture decisions

- The app is local-first and privacy-first.
- No direct bank connection, no external financial APIs, and no cloud database for MVP.
- All durable MVP data lives in IndexedDB via Dexie.
- Upload support is PDF-first, with CSV and XLSX also supported.
- PDF support targets text-based statements only for MVP. Scanned/image PDFs should fail clearly or go to review, not be guessed.
- Overlapping month-to-date uploads are expected behavior, not an edge case.
- Dedupe is mandatory and is based on a canonical transaction fingerprint:
  - `sourceType`
  - `date`
  - `normalizedDescription`
  - `signedAmount`
- Import batch metadata and canonical transactions are stored separately.
- Uncertain parsed rows go to the review queue instead of being silently trusted.
- Week-on-week and month-to-date metrics must be computed from deduplicated canonical transactions, not raw imports.
- Weeks are Monday to Sunday.
- Excluded credits, refunds, transfers, and card payments remain visible in the ledger but do not count toward spend KPIs by default.
- Credit-card `Cr.` rows must stay positive through parsing and normalization so incoming credits display correctly.
