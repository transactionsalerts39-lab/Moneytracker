# PARSERS.md

## Supported input types

- PDF
- CSV
- XLSX / Excel

## Parser strategy

### PDF

- Use `pdfjs-dist` in the browser
- Extract positioned text items and group them into line structures
- Route by source type:
  - `lib/parsers/pdf/icici-credit-card-current.ts`
  - `lib/parsers/pdf/icici-savings-transaction-history.ts`
- ICICI credit-card parser expects:
  - statement period in header
  - transaction date
  - details
  - amount with `Dr.` / `Cr.`
  - reference number
- ICICI savings parser expects:
  - statement period in header
  - serial number + transaction date anchor rows
  - multiline remarks
  - separate withdrawal / deposit columns

### CSV / XLSX

- Use `papaparse` for CSV
- Use `xlsx` for workbook files
- Auto-detect common headers first
- Normalize into shared parsed row shape
- Manual mapping fallback is still to be built

## Known assumptions

- PDF support is for text-based statements only
- Savings narration extraction is layout-sensitive and may flag more rows for review until tuned further
- Credit-card `Cr.` entries must stay positive through parsing and normalization
- Repeated month-to-date uploads are normal and must dedupe cleanly

## Where to update bank-specific parsing rules

- Credit-card PDF: `lib/parsers/pdf/icici-credit-card-current.ts`
- Savings PDF: `lib/parsers/pdf/icici-savings-transaction-history.ts`
- Shared PDF line extraction: `lib/parsers/pdf/extract-lines.ts`
- Tabular parsing: `lib/parsers/tabular/index.ts`
- Normalization and import commit path: `lib/ingestion/import-statement.ts`
- Categorization/exclusion rules: `lib/rules/categorize.ts`

## How to test parsing against real samples

1. Put private real files into:
   - `samples/private/icici/savings/`
   - `samples/private/icici/credit-card/`
2. Run the app locally with `npm run dev`
3. Upload the real statement from the UI
4. Inspect:
   - batch counts in `Upload`
   - resulting canonical rows in `Transactions`
   - review items in `Review queue`
5. If parser logic changed materially, also run:

```bash
npm run lint
npm run build
```

## How overlap and dedupe should be verified

- Import a month-to-date statement once and note totals
- Reimport the same file; totals must not increase
- Import a later overlapping month-to-date file; only net-new canonical transactions should be added
- Check `Upload` for duplicate counts
- Check `Transactions` and dashboard totals to confirm there is no double counting
