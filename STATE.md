# STATE.md

## Current status

Usable local MVP shell with real upload/import wiring for ICICI PDF statements and tabular file scaffolding, plus a device-aware mobile UI split, billing-cycle-aware card totals, and improved transactions/upload UX.

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
- Device-aware UI mode resolution with separate mobile and desktop shells, plus a local-only `Auto / Mobile / Desktop` override saved per browser/device
- Mobile-specific dashboard and transactions presentations that reuse the same local Dexie data and drill-down/filter logic as desktop

## What is partially working

- Savings PDF parser works, but narration extraction still uses layout heuristics and may send more rows to review than ideal
- CSV/XLSX imports do not yet have manual column-mapping UI
- Review queue is visible, but accept/edit/exclude/merge actions are not implemented yet
- Export actions are scaffolded in Settings but not fully wired
- Current billing-cycle total now behaves like a gross card bill: it includes credit-card debit rows in the cycle, includes `pending_review` rows, and ignores credits/refunds so they do not reduce the total
- Delete-latest-batch currently removes transactions created by that batch; it does not yet recompute canonical rows from remaining raw sightings
- Upload and Settings use the new mobile shell and sizing adjustments, but only Dashboard and Transactions have fully distinct mobile-first layouts in this slice

## Current blockers

- No manual review action workflow yet
- No tabular manual mapping fallback UI yet
- Batch deletion still does not rebuild canonical transactions from retained sightings after removing an overlapping import
- Batch deletion/rebuild logic is simpler than the intended final overlap reconciliation model
- Mobile UI currently keys off viewport plus a per-device override; there is still no true cross-device/account sync for view preferences

## Next 3 priorities

1. Implement review queue actions (`accept`, `edit`, `exclude`, `merge`) so pending rows can feed back into accurate billing/spend totals
2. Add manual CSV/XLSX column-mapping UI with saved mappings
3. Strengthen batch deletion and overlap reconciliation using retained raw sightings, not only batch-origin transaction deletion

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

## Last updated

2026-03-11
