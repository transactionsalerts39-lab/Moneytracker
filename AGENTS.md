# AGENTS.md

## Project goal

Build a local-first personal finance dashboard for one user. The app must ingest statement files for savings and credit-card accounts, normalize them into one canonical ledger, dedupe overlapping month-to-date uploads, store everything in the browser, and expose clear dashboards, filters, and review workflows without any cloud dependency.

## Read this first

Before making non-trivial changes, read:

1. `STATE.md`
2. `DECISIONS.md`
3. `PARSERS.md` if the change touches imports, parsing, review, or dedupe

Before finishing a meaningful task, update `STATE.md` with what changed, current blockers, and the next priorities.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Recharts
- Dexie / IndexedDB
- Zod
- `pdfjs-dist`
- `papaparse`
- `xlsx`

## How to run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## How to test changes

Minimum verification for meaningful changes:

```bash
npm run lint
npm run build
```

If parsing/import behavior changes, also test with real local sample statements in `samples/private/icici/`.

## Key workflows

- Upload flow: `Upload` page -> parser selection -> normalization -> dedupe -> IndexedDB write -> dashboard and transactions refresh
- Review flow: uncertain rows are marked `pending_review` and surfaced in `Transactions > Review queue`
- Drill-down flow: dashboard KPI cards and charts route into `Transactions` with pre-applied filters
- Reset/reimport flow: `Settings` can clear local data, then files can be reimported from scratch

## Important code locations

- App routes: `app/(workspace)/`
- Dashboard UI: `components/dashboard/`
- Transactions UI: `components/transactions/`
- Upload UI: `components/upload/`
- Settings UI: `components/settings/`
- IndexedDB schema and local state helpers: `lib/storage/db.ts`
- Import pipeline: `lib/ingestion/import-statement.ts`
- Shared finance helpers and drill-down logic: `lib/finance.ts`
- Dedupe logic: `lib/dedupe/index.ts`
- Categorization and exclusion rules: `lib/rules/categorize.ts`
- PDF parsers: `lib/parsers/pdf/`
- CSV/XLSX parser: `lib/parsers/tabular/index.ts`
- Shared parser types: `lib/parsers/types.ts`
- Core transaction types: `types/finance.ts`

## What must not be broken

- Local-first, browser-only persistence
- No backend, no external financial APIs, no direct bank connection
- PDF upload support for text-based statements
- CSV/XLSX upload support
- Overlapping month-to-date uploads must not double count canonical transactions
- Dashboard metrics must come from deduplicated canonical transactions, not raw rows
- Credits, refunds, and transfers must retain correct sign and direction
- Review queue must remain available for uncertain rows

## Import / parsing / dedupe expectations

- Detect file type first (`pdf`, `csv`, `xlsx`)
- Route to the correct parser by source type and file type
- Extract raw rows
- Normalize into the shared transaction schema
- Build a canonical fingerprint using:
  - `sourceType`
  - `date`
  - `normalizedDescription`
  - `signedAmount`
- Skip exact duplicates across repeated imports
- Flag near-duplicates for review rather than auto-merging
- Keep import batch metadata separate from canonical transactions

## Session handoff workflow

- Start of session: read `AGENTS.md`, `STATE.md`, `DECISIONS.md`
- During session: make focused changes and verify them with `lint` / `build`
- End of session: update `STATE.md` with completed work, remaining work, blockers, and next steps
