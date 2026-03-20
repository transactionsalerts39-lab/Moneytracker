# STATE.md

## Current status

Usable local MVP shell with real upload/import wiring for ICICI PDF statements and tabular file scaffolding, plus a device-aware mobile UI split, billing-cycle-aware card totals, a dashboard-level custom date range filter, preserved uploaded statement copies in IndexedDB, auto-detected single-entry uploads, upload/settings storage visibility, improved transactions/upload UX, cleaner savings UPI merchant/display labels, durable transaction notes/tags stored against canonical fingerprints, income-specific analytics cards, and chronologically sorted weekly/monthly dashboard trend series that no longer depend on import order.

## What is working

- Next.js app with `Dashboard`, `Upload`, `Transactions`, and `Settings`
- Local IndexedDB persistence through Dexie
- Demo seed on first run
- Real PDF upload flow for current ICICI credit-card and savings statement layouts
- CSV/XLSX parser path with header auto-detection
- Canonical transaction normalization, exact dedupe, and review staging
- Dashboard KPI/chart drill-downs into filtered transactions
- Configurable credit-card billing cycle day stored in IndexedDB settings, with current-cycle totals on the dashboard and transactions screen
- Transaction sorting directly from the `Date` and `Amount` column headers, plus compact custom date range filtering
- Multi-file uploads per source type in the upload UI, with separate local batches and overlap-safe canonical dedupe
- Uploaded statement files are now preserved as IndexedDB Blob copies linked to each import batch, so imported data remains usable even if the original filesystem PDF/CSV/XLSX is deleted later
- Upload now uses a single dropzone and auto-detects `savings` vs `credit_card` statements before routing them through the correct PDF/tabular parser path
- Upload now surfaces net-new canonical rows versus exact overlaps for each batch, plus a preserved statement archive with reopen/download access to historical local copies
- Settings now shows browser storage usage/quota estimates, archived statement-copy size, and live counts for canonical transactions, raw rows, and import batches
- Device-aware UI mode resolution with separate mobile and desktop shells, plus a local-only `Auto / Mobile / Desktop` override saved per browser/device
- Mobile-specific dashboard and transactions presentations that reuse the same local Dexie data and drill-down/filter logic as desktop
- Savings UPI rows now derive a cleaner merchant/counterparty label and shorter display description while preserving raw narration for dedupe and drill-down detail
- Transactions can now store one local note plus multiple free-form local tags in IndexedDB annotations keyed by `transactionFingerprint`, so metadata survives reloads and overlapping reimports
- Transaction search now matches note/tag metadata, the ledger surfaces note/tag badges on desktop and mobile, and the transaction detail sheet allows local note/tag editing
- Transaction detail now leads with a compact summary, keeps comment/tags immediately accessible, and hides lower-value import metadata behind a single expandable details section
- Transactions can now also be filtered directly by annotation state on desktop and mobile (`With comment`, `With tags`, `With both`) so annotated rows are easy to isolate without relying on search text
- Dashboard analytics now expose dedicated income KPIs (`Income this month` and `Income in range`) using all incoming credit transactions in scope, while net cash impact continues to compare those incoming credits against outgoing totals
- Weekly spend and monthly trend charts now group by canonical `weekStart` / `monthStart` keys and sort by those ISO dates, with the weekly chart rendered newest-first from left to right so the current week stays immediately visible instead of trailing at the far right
- Weekly spend cards on desktop and mobile now allow horizontal scrolling once the bucket count outgrows the card width, so older and newer weeks remain reachable without compressing labels into unreadable bars
- Weekly spend bars now total every outgoing debit in the Monday-Sunday bucket and drill into `Transactions` using the same week-plus-outgoing rule, so the chart matches the ledger slice the user sees for that period
- Default and custom-range dashboard KPI cards now follow the same flow-based rule: outgoing cards total all debit transactions in scope, income cards total all incoming credit transactions in scope, and the linked drill-downs use matching `flow=outgoing` / `flow=incoming` filters instead of narrower spend-only or `category=Income` logic

## What is partially working

- Savings PDF parser works, but narration extraction still uses layout heuristics and UPI naming heuristics still need validation against more real statement variants
- CSV/XLSX imports do not yet have manual column-mapping UI
- Review queue is visible, but accept/edit/exclude/merge actions are not implemented yet
- Export actions are scaffolded in Settings but not fully wired
- Current billing-cycle total now behaves like a gross card bill: it includes credit-card debit rows in the cycle, includes `pending_review` rows, and ignores credits/refunds so they do not reduce the total
- Delete-latest-batch currently removes transactions created by that batch; it does not yet recompute canonical rows from remaining raw sightings
- Delete-latest-batch also removes the archived source-file copy for that batch, but still does not recompute canonical rows from retained overlapping sightings
- Upload and Settings use the new mobile shell and sizing adjustments, but only Dashboard and Transactions have fully distinct mobile-first layouts in this slice
- Dashboard now supports a compact pill-style custom date range filter that opens a small popover with a single-month range calendar, supports click-to-select start/end dates with highlighted spans, collapses back down, and drives an expense-first custom-range dashboard; debit spend cards and charts can include `pending_review` rows while incoming money is summarized separately in the signal board
- Notes/tags are manual-only metadata in this slice; there are no tag filters, saved views, rule-based auto-tagging, or budget/reporting flows built on top of them yet

## Current blockers

- No manual review action workflow yet
- No tabular manual mapping fallback UI yet
- Batch deletion still does not rebuild canonical transactions from retained sightings after removing an overlapping import
- Batch deletion/rebuild logic is simpler than the intended final overlap reconciliation model
- Mobile UI currently keys off viewport plus a per-device override; there is still no true cross-device/account sync for view preferences
- No real-sample regression set yet for validating additional ICICI savings UPI narration patterns beyond the current heuristic pass
- Dashboard date range is currently session-local UI state; it is not yet persisted to IndexedDB or mirrored into the URL for shareable/reload-stable deep links
- Archived source files currently load directly from IndexedDB in the browser UI; there is no retention policy yet for pruning older preserved file copies when storage pressure grows
- Auto-detect currently targets the known ICICI savings/credit-card formats and tabular header shapes; genuinely ambiguous tabular files still fail cleanly instead of asking the user which source type to use
- The new transaction-annotation table can outlive a deleted canonical row until that fingerprint appears again or local data is reset; batch-deletion/rebuild logic still needs the broader overlap-reconciliation rewrite before annotation cleanup can be fully canonical-aware

## Next 3 priorities

1. Implement review queue actions (`accept`, `edit`, `exclude`, `merge`) so pending rows can feed back into accurate billing/spend totals and income KPIs
2. Strengthen batch deletion and overlap reconciliation using retained raw sightings, not only batch-origin transaction deletion, so deleting a batch/archive copy does not discard still-supported canonical history or strand annotation metadata
3. Extend the new annotation layer into actual organization workflows: tag filters/saved views first, then budgeting/reporting slices built on categories plus tags

## Important files

- `lib/ingestion/import-statement.ts`
- `lib/parsers/pdf/icici-credit-card-current.ts`
- `lib/parsers/pdf/icici-savings-transaction-history.ts`
- `components/upload/upload-view.tsx`
- `components/transactions/transactions-view.tsx`
- `components/dashboard/dashboard-view.tsx`
- `components/settings/settings-view.tsx`
- `lib/finance.ts`
- `lib/storage/db.ts`

## Environment notes

- Vercel CLI auth token is currently exported from `~/.zshrc` as `VERCEL_TOKEN`; if deploys fail with missing credentials, check that file first rather than bash profile files.

## Last updated

2026-03-20
