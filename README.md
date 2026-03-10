# Moneytracker

Local-first personal finance dashboard for one user. The app runs entirely in the browser, stores data in IndexedDB, and is being tuned first for ICICI savings and ICICI credit-card statements.

## Current status

This repo now includes:

- a polished Next.js app shell with `Dashboard`, `Upload`, `Transactions`, and `Settings`
- seeded demo data stored in IndexedDB on first load
- dashboard charts and KPIs based on canonical local transactions
- transaction library with sorting, filters, date range filtering, and dashboard/chart drill-downs
- review queue visibility for uncertain rows
- upload/import flow for ICICI savings and credit-card PDFs
- parser support for PDF plus CSV/XLSX ingestion paths
- sample CSV files in `public/sample-data/`

The core import pipeline is now wired, but review actions, manual tabular mapping UI, and export polish are still incomplete.

## Working with Codex

Future Codex sessions or contributors should read these files first:

1. `AGENTS.md`
2. `STATE.md`
3. `DECISIONS.md`

If the task touches imports or parsing, also read `PARSERS.md`.

At the end of a meaningful session, refresh `STATE.md` with:

- what was completed
- what still needs work
- blockers
- next priorities

## Session handoff workflow

- Start of session: read `AGENTS.md`, `STATE.md`, and `DECISIONS.md`
- During session: make focused changes and verify them
- End of session: update `STATE.md` with completed work, remaining work, blockers, and next steps

## Simple local setup

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

4. The demo dataset loads automatically the first time so the dashboard is not empty.

## Where weekly uploads will happen

You do not need to copy weekly statements into the project folder during normal use.

- Open the app
- Go to `Upload`
- Drag in the savings or credit-card file from anywhere on your machine

The browser reads the file locally. Persistent data is stored in IndexedDB.

## Private sample fixtures for parser tuning

For development and parser adaptation, keep your real statement files in:

```text
samples/private/icici/savings/
samples/private/icici/credit-card/
```

These folders are gitignored so your personal statements do not get committed.

Current real reference PDFs used during parser tuning:

- `CCStatement_Current10-03-2026.pdf`
- `OpTransactionHistory10-03-2026.pdf`

## Sample files

Repo-safe sample files live in `public/sample-data/`:

- `savings-sample.csv`
- `credit-card-sample.csv`
- `savings-sample.xlsx`
- `credit-card-sample.xlsx`

## Parser adaptation workflow

1. Put real bank files into `samples/private/icici/savings/` or `samples/private/icici/credit-card/`
2. Update the relevant parser module:
   - `lib/parsers/pdf/icici-savings-transaction-history.ts`
   - `lib/parsers/pdf/icici-credit-card-current.ts`
   - `lib/parsers/tabular/index.ts`
3. Confirm extracted fields line up with the statement layout:
   - savings: transaction date, multiline remarks, withdrawal, deposit, balance
   - credit card: transaction date, details, amount with `Dr.` / `Cr.`, reference number
4. Normalize rows into the shared transaction schema
5. Verify repeated month-to-date uploads resolve to one canonical fingerprint per transaction

For more parser-specific notes, assumptions, and verification guidance, use `PARSERS.md`.

## Week and spend logic

- Weeks are Monday to Sunday
- Dashboard spend totals come from transaction dates, never upload dates
- Excluded rows such as salary credits, refunds, transfers, and card bill payments stay visible in the ledger but do not count toward spend KPIs by default

## Verification commands

```bash
npm run lint
npm run build
```
