"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, ChevronDown, Funnel, MessageSquare, Plus, Search, Tag, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCurrency,
  getBillingCycleStartDay,
  getBillingCycleWindow,
  getPresetMeta,
  getReviewRows,
  getTransactionDescriptionLabel,
  getTransactionMerchantLabel,
  matchesTransactionPreset,
  type TransactionPreset,
} from "@/lib/finance";
import { db, normalizeTransactionAnnotationTags, saveTransactionAnnotation } from "@/lib/storage/db";
import { useViewportMode } from "@/lib/ui/viewport-mode";
import { cn } from "@/lib/utils";
import type { RawImportedRow, Transaction, TransactionAnnotation } from "@/types/finance";

type AnnotationFilter = "all" | "comment" | "tags" | "both";

export function TransactionsView() {
  const { resolvedMode } = useViewportMode();
  const data = useTransactionsData();

  if (data.loading) {
    return <p className="text-sm text-slate-500">Loading transactions…</p>;
  }

  return resolvedMode === "mobile" ? <MobileTransactionsView {...data} /> : <DesktopTransactionsView {...data} />;
}

function useTransactionsData() {
  const searchParams = useSearchParams();
  const transactions = useLiveQuery(() => db.transactions.orderBy("date").reverse().toArray(), []);
  const rawRows = useLiveQuery(() => db.rawImportedRows.toArray(), []);
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const annotations = useLiveQuery(() => db.transactionAnnotations.toArray(), []);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") ?? "all");
  const [flowFilter, setFlowFilter] = useState(searchParams.get("flow") ?? "all");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") ?? "all");
  const [annotationFilter, setAnnotationFilter] = useState(normalizeAnnotationFilter(searchParams.get("annotations")));
  const [sortOrder, setSortOrder] = useState("date-desc");
  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to") ?? "");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const preset = searchParams.get("preset") as TransactionPreset | null;
  const weekStartFilter = searchParams.get("weekStart");

  if (!transactions || !rawRows || !settings || !annotations) {
    return { loading: true as const };
  }

  const annotationsByFingerprint = new Map(annotations.map((annotation) => [annotation.transactionFingerprint, annotation]));
  const billingCycleStartDay = getBillingCycleStartDay(settings);
  const billingCycleWindow = getBillingCycleWindow(billingCycleStartDay);
  const billingCycleSummaryRows = transactions.filter(
    (transaction) =>
      transaction.sourceType === "credit_card" &&
      transaction.date >= billingCycleWindow.startDate &&
      transaction.date <= billingCycleWindow.throughDate,
  );
  const billingCycleAmountDue = billingCycleSummaryRows
    .filter((transaction) => transaction.direction === "debit")
    .reduce((total, transaction) => total + Math.abs(transaction.signedAmount), 0);
  const billingCyclePendingReviewCount = billingCycleSummaryRows.filter(
    (transaction) => transaction.status === "pending_review",
  ).length;
  const presetMeta = preset ? getPresetMeta(preset, billingCycleStartDay) : null;
  const availableCategories = Array.from(new Set(transactions.map((transaction) => transaction.category))).sort();
  const filtered = transactions
    .filter((transaction) => {
      const annotation = annotationsByFingerprint.get(transaction.transactionFingerprint);
      const merchantLabel = getTransactionMerchantLabel(transaction).toLowerCase();
      const descriptionLabel = getTransactionDescriptionLabel(transaction).toLowerCase();
      const rawDescription = transaction.description.toLowerCase();
      const noteText = annotation?.note.toLowerCase() ?? "";
      const tagText = annotation?.tags.join(" ").toLowerCase() ?? "";
      const matchesPreset = preset ? matchesTransactionPreset(transaction, preset, new Date(), billingCycleStartDay) : true;
      const matchesWeekStart = weekStartFilter ? transaction.weekStart === weekStartFilter : true;
      const matchesSearch =
        rawDescription.includes(search.toLowerCase()) ||
        descriptionLabel.includes(search.toLowerCase()) ||
        merchantLabel.includes(search.toLowerCase()) ||
        noteText.includes(search.toLowerCase()) ||
        tagText.includes(search.toLowerCase());
      const matchesSource = sourceFilter === "all" || transaction.sourceType === sourceFilter;
      const matchesFlow =
        flowFilter === "all" ||
        (flowFilter === "incoming" && transaction.direction === "credit") ||
        (flowFilter === "outgoing" && transaction.direction === "debit");
      const matchesCategory = categoryFilter === "all" || transaction.category === categoryFilter;
      const matchesAnnotation = matchesTransactionAnnotationFilter(annotation, annotationFilter);
      const matchesFromDate = !fromDate || transaction.date >= fromDate;
      const matchesToDate = !toDate || transaction.date <= toDate;

      return (
        matchesPreset &&
        matchesWeekStart &&
        matchesSearch &&
        matchesSource &&
        matchesFlow &&
        matchesCategory &&
        matchesAnnotation &&
        matchesFromDate &&
        matchesToDate
      );
    })
    .sort((left, right) => sortTransactions(left, right, sortOrder));
  const reviewRows = getReviewRows(rawRows);

  const clearDateFilters = () => {
    setFromDate("");
    setToDate("");
  };

  const clearNonSearchFilters = () => {
    setSourceFilter("all");
    setFlowFilter("all");
    setCategoryFilter("all");
    setAnnotationFilter("all");
    clearDateFilters();
  };

  const applyCurrentBillingCycleFilter = () => {
    setSourceFilter("credit_card");
    setFlowFilter("all");
    setFromDate(billingCycleWindow.startDate);
    setToDate(billingCycleWindow.throughDate);
  };

  const activeFilterCount = [sourceFilter !== "all", flowFilter !== "all", categoryFilter !== "all", annotationFilter !== "all", Boolean(fromDate), Boolean(toDate)].filter(
    Boolean,
  ).length;

  return {
    loading: false as const,
    search,
    setSearch,
    sourceFilter,
    setSourceFilter,
    flowFilter,
    setFlowFilter,
    categoryFilter,
    setCategoryFilter,
    annotationFilter,
    setAnnotationFilter,
    sortOrder,
    setSortOrder,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedTransaction,
    setSelectedTransaction,
    presetMeta,
    weekStartFilter,
    filtered,
    reviewRows,
    annotationsByFingerprint,
    availableCategories,
    billingCycleStartDay,
    billingCycleWindow,
    billingCycleAmountDue,
    billingCyclePendingReviewCount,
    clearDateFilters,
    clearNonSearchFilters,
    applyCurrentBillingCycleFilter,
    activeFilterCount,
  };
}

function DesktopTransactionsView({
  search,
  setSearch,
  sourceFilter,
  setSourceFilter,
  flowFilter,
  setFlowFilter,
  categoryFilter,
  setCategoryFilter,
  annotationFilter,
  setAnnotationFilter,
  sortOrder,
  setSortOrder,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  selectedTransaction,
  setSelectedTransaction,
  presetMeta,
  weekStartFilter,
  filtered,
  reviewRows,
  annotationsByFingerprint,
  availableCategories,
  billingCycleStartDay,
  billingCycleWindow,
  billingCycleAmountDue,
  billingCyclePendingReviewCount,
  clearDateFilters,
  clearNonSearchFilters,
  applyCurrentBillingCycleFilter,
}: LoadedTransactionsData) {
  return (
    <div className="space-y-8">
      <TransactionsHeader filteredCount={filtered.length} reviewCount={reviewRows.length} compact={false} />

      <PresetBanner
        presetMeta={presetMeta}
        filteredCount={filtered.length}
        weekStartFilter={weekStartFilter}
        clearFilters={clearNonSearchFilters}
        compact={false}
      />

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="all" className="rounded-xl px-4 py-2">
            All transactions
          </TabsTrigger>
          <TabsTrigger value="review" className="rounded-xl px-4 py-2">
            Review queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
            <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Transaction library</CardTitle>
                <CardDescription>Search by merchant, description, note, or tag and drill into the canonical record.</CardDescription>
              </div>
              <DesktopFilterRow
                search={search}
                setSearch={setSearch}
                sourceFilter={sourceFilter}
                setSourceFilter={setSourceFilter}
                flowFilter={flowFilter}
                setFlowFilter={setFlowFilter}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                annotationFilter={annotationFilter}
                setAnnotationFilter={setAnnotationFilter}
                availableCategories={availableCategories}
              />
            </CardHeader>
            <CardContent>
              <CardCyclePanel
                billingCycleStartDay={billingCycleStartDay}
                billingCycleWindow={billingCycleWindow}
                billingCycleAmountDue={billingCycleAmountDue}
                billingCyclePendingReviewCount={billingCyclePendingReviewCount}
                applyCurrentBillingCycleFilter={applyCurrentBillingCycleFilter}
                fromDate={fromDate}
                setFromDate={setFromDate}
                toDate={toDate}
                setToDate={setToDate}
                clearDateFilters={clearDateFilters}
                compact={false}
              />

              <div className="overflow-hidden rounded-[24px] border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-left font-medium text-slate-700 transition hover:text-slate-950"
                          onClick={() => setSortOrder(getNextSortOrder("date", sortOrder))}
                        >
                          Date
                          <SortIndicator active={sortOrder.startsWith("date")} direction={getSortDirection(sortOrder)} />
                        </button>
                      </TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Flow</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          className="ml-auto inline-flex items-center gap-1.5 font-medium text-slate-700 transition hover:text-slate-950"
                          onClick={() => setSortOrder(getNextSortOrder("amount", sortOrder))}
                        >
                          Amount
                          <SortIndicator active={sortOrder.startsWith("amount")} direction={getSortDirection(sortOrder)} />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((transaction) => {
                      const annotation = annotationsByFingerprint.get(transaction.transactionFingerprint);
                      const merchantLabel = getTransactionMerchantLabel(transaction);
                      const descriptionLabel = getTransactionDescriptionLabel(transaction);

                      return (
                        <TableRow
                          key={transaction.id}
                          className={cn(
                            "cursor-pointer",
                            transaction.direction === "credit" && "bg-emerald-50/60 hover:bg-emerald-50",
                          )}
                          onClick={() => setSelectedTransaction(transaction)}
                        >
                          <TableCell>{transaction.date}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-900">{merchantLabel}</p>
                              <p className="text-xs text-slate-500">{descriptionLabel}</p>
                              <TransactionAnnotationBadges annotation={annotation} className="mt-2" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-900">{transaction.category}</p>
                              <p className="text-xs text-slate-500">{getTransactionQualifier(transaction)}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <FlowBadge direction={transaction.direction} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="rounded-full capitalize">
                              {transaction.sourceType.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                              {transaction.statementFileType.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              transaction.direction === "credit" ? "text-emerald-700" : "text-slate-900",
                            )}
                          >
                            {formatSignedAmount(transaction)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <ReviewQueueCard reviewRows={reviewRows} compact={false} />
        </TabsContent>
      </Tabs>

      <TransactionDetailSheet
        selectedTransaction={selectedTransaction}
        setSelectedTransaction={setSelectedTransaction}
        annotationsByFingerprint={annotationsByFingerprint}
        side="right"
      />
    </div>
  );
}

function MobileTransactionsView({
  search,
  setSearch,
  sourceFilter,
  setSourceFilter,
  flowFilter,
  setFlowFilter,
  categoryFilter,
  setCategoryFilter,
  annotationFilter,
  setAnnotationFilter,
  sortOrder,
  setSortOrder,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  selectedTransaction,
  setSelectedTransaction,
  presetMeta,
  weekStartFilter,
  filtered,
  reviewRows,
  annotationsByFingerprint,
  availableCategories,
  billingCycleStartDay,
  billingCycleWindow,
  billingCycleAmountDue,
  billingCyclePendingReviewCount,
  clearDateFilters,
  clearNonSearchFilters,
  applyCurrentBillingCycleFilter,
  activeFilterCount,
}: LoadedTransactionsData) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-4">
      <TransactionsHeader filteredCount={filtered.length} reviewCount={reviewRows.length} compact />

      <PresetBanner
        presetMeta={presetMeta}
        filteredCount={filtered.length}
        weekStartFilter={weekStartFilter}
        clearFilters={clearNonSearchFilters}
        compact
      />

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="all" className="rounded-xl px-4 py-2">
            All transactions
          </TabsTrigger>
          <TabsTrigger value="review" className="rounded-xl px-4 py-2">
            Review queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
            <CardContent className="space-y-4 px-4 py-4">
              <div className="flex items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50/90 p-2">
                <Search className="size-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search merchant, note, or tag"
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-2xl border-slate-200 bg-white"
                  onClick={() => setFiltersOpen(true)}
                >
                  <Funnel className="size-4" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white">{activeFilterCount}</span>
                  ) : null}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-slate-200 bg-white"
                  onClick={applyCurrentBillingCycleFilter}
                >
                  <CalendarRange className="size-4" />
                  Cycle
                </Button>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white p-2 text-slate-700 shadow-sm">
                    <CalendarRange className="size-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Card cycle</p>
                    <p className="text-sm font-semibold text-slate-900">
                      Day {billingCycleStartDay} • {billingCycleWindow.activeRangeLabel}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Actual bill {formatCurrency(billingCycleAmountDue)}
                  {billingCyclePendingReviewCount > 0 ? ` • ${billingCyclePendingReviewCount} pending review` : ""}
                </p>
              </div>

              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <EmptyStateCard text="No transactions match the current mobile filters." />
                ) : (
                  filtered.map((transaction) => {
                    const annotation = annotationsByFingerprint.get(transaction.transactionFingerprint);
                    const merchantLabel = getTransactionMerchantLabel(transaction);
                    const descriptionLabel = getTransactionDescriptionLabel(transaction);

                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        className={cn(
                          "w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-slate-300",
                          transaction.direction === "credit" && "border-emerald-200 bg-emerald-50/40",
                        )}
                        onClick={() => setSelectedTransaction(transaction)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{merchantLabel}</p>
                            <p className="mt-1 text-xs text-slate-500">{descriptionLabel}</p>
                          </div>
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              transaction.direction === "credit" ? "text-emerald-700" : "text-slate-900",
                            )}
                          >
                            {formatSignedAmount(transaction)}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="secondary" className="rounded-full">
                            {transaction.date}
                          </Badge>
                          <Badge variant="secondary" className="rounded-full capitalize">
                            {transaction.category}
                          </Badge>
                          <FlowBadge direction={transaction.direction} />
                          <Badge variant="secondary" className="rounded-full capitalize">
                            {transaction.sourceType.replace("_", " ")}
                          </Badge>
                        </div>
                        <TransactionAnnotationBadges annotation={annotation} className="mt-3" compact />
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <ReviewQueueCard reviewRows={reviewRows} compact />
        </TabsContent>
      </Tabs>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-[32px] border-t-slate-200">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value ?? "all")}>
                <SelectTrigger className="w-full rounded-2xl border-slate-200">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="credit_card">Credit card</SelectItem>
                </SelectContent>
              </Select>

              <Select value={flowFilter} onValueChange={(value) => setFlowFilter(value ?? "all")}>
                <SelectTrigger className="w-full rounded-2xl border-slate-200">
                  <SelectValue placeholder="Flow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All flow</SelectItem>
                  <SelectItem value="incoming">Incoming</SelectItem>
                  <SelectItem value="outgoing">Outgoing</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? "all")}>
                <SelectTrigger className="w-full rounded-2xl border-slate-200 sm:col-span-2">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={annotationFilter} onValueChange={(value) => setAnnotationFilter((value as AnnotationFilter | null) ?? "all")}>
                <SelectTrigger className="w-full rounded-2xl border-slate-200 sm:col-span-2">
                  <SelectValue placeholder="Notes and tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All notes/tags</SelectItem>
                  <SelectItem value="comment">With comment</SelectItem>
                  <SelectItem value="tags">With tags</SelectItem>
                  <SelectItem value="both">With both</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value ?? "date-desc")}>
                <SelectTrigger className="w-full rounded-2xl border-slate-200 sm:col-span-2">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Newest first</SelectItem>
                  <SelectItem value="date-asc">Oldest first</SelectItem>
                  <SelectItem value="amount-desc">Largest amount first</SelectItem>
                  <SelectItem value="amount-asc">Smallest amount first</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Start
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-10 rounded-2xl border-slate-200 bg-white text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                End
                <Input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-10 rounded-2xl border-slate-200 bg-white text-sm"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1 rounded-2xl" onClick={clearDateFilters}>
                Clear dates
              </Button>
              <Button type="button" variant="outline" className="flex-1 rounded-2xl border-slate-200" onClick={clearNonSearchFilters}>
                Reset filters
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <TransactionDetailSheet
        selectedTransaction={selectedTransaction}
        setSelectedTransaction={setSelectedTransaction}
        annotationsByFingerprint={annotationsByFingerprint}
        side="bottom"
      />
    </div>
  );
}

function TransactionsHeader({
  filteredCount,
  reviewCount,
  compact,
}: {
  filteredCount: number;
  reviewCount: number;
  compact: boolean;
}) {
  return (
    <section
      className={cn(
        "border-b border-slate-200/70 pb-6",
        compact ? "space-y-4 rounded-[28px] border bg-white/90 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]" : "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
      )}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Transactions</p>
        <h2 className={cn("mt-3 font-semibold tracking-tight text-slate-950", compact ? "text-3xl" : "text-4xl")}>
          Inspect the canonical ledger.
        </h2>
        <p className={cn("mt-3 max-w-2xl text-sm leading-6 text-slate-600", compact && "max-w-none")}>
          Search, filter, tag, and review the canonical IndexedDB ledger without changing how desktop behaves.
        </p>
      </div>
      <div className="flex gap-2">
        <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">{filteredCount} visible rows</Badge>
        <Badge variant="secondary" className="rounded-full px-3 py-1">
          {reviewCount} review items
        </Badge>
      </div>
    </section>
  );
}

function DesktopFilterRow({
  search,
  setSearch,
  sourceFilter,
  setSourceFilter,
  flowFilter,
  setFlowFilter,
  categoryFilter,
  setCategoryFilter,
  annotationFilter,
  setAnnotationFilter,
  availableCategories,
}: {
  search: string;
  setSearch: (value: string) => void;
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  flowFilter: string;
  setFlowFilter: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  annotationFilter: AnnotationFilter;
  setAnnotationFilter: (value: AnnotationFilter) => void;
  availableCategories: string[];
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search merchant, note, or tag"
        className="w-full rounded-2xl border-slate-200 md:w-72"
      />
      <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value ?? "all")}>
        <SelectTrigger className="w-full rounded-2xl border-slate-200 md:w-44">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          <SelectItem value="savings">Savings</SelectItem>
          <SelectItem value="credit_card">Credit card</SelectItem>
        </SelectContent>
      </Select>
      <Select value={flowFilter} onValueChange={(value) => setFlowFilter(value ?? "all")}>
        <SelectTrigger className="w-full rounded-2xl border-slate-200 md:w-44">
          <SelectValue placeholder="Flow" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All flow</SelectItem>
          <SelectItem value="incoming">Incoming</SelectItem>
          <SelectItem value="outgoing">Outgoing</SelectItem>
        </SelectContent>
      </Select>
      <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value ?? "all")}>
        <SelectTrigger className="w-full rounded-2xl border-slate-200 md:w-48">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {availableCategories.map((category) => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={annotationFilter} onValueChange={(value) => setAnnotationFilter((value as AnnotationFilter | null) ?? "all")}>
        <SelectTrigger className="w-full rounded-2xl border-slate-200 md:w-44">
          <SelectValue placeholder="Notes/tags" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All notes/tags</SelectItem>
          <SelectItem value="comment">With comment</SelectItem>
          <SelectItem value="tags">With tags</SelectItem>
          <SelectItem value="both">With both</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function CardCyclePanel({
  billingCycleStartDay,
  billingCycleWindow,
  billingCycleAmountDue,
  billingCyclePendingReviewCount,
  applyCurrentBillingCycleFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  clearDateFilters,
  compact,
}: {
  billingCycleStartDay: number;
  billingCycleWindow: ReturnType<typeof getBillingCycleWindow>;
  billingCycleAmountDue: number;
  billingCyclePendingReviewCount: number;
  applyCurrentBillingCycleFilter: () => void;
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  clearDateFilters: () => void;
  compact: boolean;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3", compact ? "" : "xl:flex-row xl:items-center xl:justify-between")}>
      <div className="flex flex-wrap items-end gap-2 rounded-[20px] border border-slate-200 bg-slate-50/90 p-2.5">
        <label className="space-y-1 px-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          Start
          <Input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className={cn("rounded-xl border-slate-200 bg-white text-sm", compact ? "h-10 w-full min-w-[140px]" : "h-9 w-[148px]")}
          />
        </label>
        <label className="space-y-1 px-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          End
          <Input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className={cn("rounded-xl border-slate-200 bg-white text-sm", compact ? "h-10 w-full min-w-[140px]" : "h-9 w-[148px]")}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-0.5 rounded-xl px-3 text-slate-600 hover:bg-white"
          onClick={clearDateFilters}
        >
          Clear dates
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50/90 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-white p-2 text-slate-700 shadow-sm">
            <CalendarRange className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Card cycle</p>
            <p className="text-sm font-semibold text-slate-900">
              Day {billingCycleStartDay} • {billingCycleWindow.activeRangeLabel}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Actual bill {formatCurrency(billingCycleAmountDue)}
          {billingCyclePendingReviewCount > 0 ? ` • ${billingCyclePendingReviewCount} pending review` : ""}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-slate-200 bg-white"
          onClick={applyCurrentBillingCycleFilter}
        >
          Use current cycle
        </Button>
      </div>
    </div>
  );
}

function PresetBanner({
  presetMeta,
  filteredCount,
  weekStartFilter,
  clearFilters,
  compact,
}: {
  presetMeta: LoadedTransactionsData["presetMeta"];
  filteredCount: number;
  weekStartFilter: string | null;
  clearFilters: () => void;
  compact: boolean;
}) {
  return (
    <>
      {presetMeta ? (
        <Card className="rounded-[24px] border-slate-200/70 bg-slate-950 text-white shadow-none">
          <CardContent className={cn("flex flex-col gap-3", compact ? "px-4 py-4" : "px-6 py-5 md:flex-row md:items-center md:justify-between")}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">KPI drill-down</p>
              <p className="mt-2 text-lg font-semibold">{presetMeta.label}</p>
              <p className="mt-1 text-sm text-slate-300">
                Showing {filteredCount} matching transactions. {presetMeta.description}
              </p>
            </div>
            <Link
              href="/transactions"
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-medium text-white transition hover:bg-white/10"
              onClick={clearFilters}
            >
              Clear preset
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {weekStartFilter ? (
        <Card className="rounded-[24px] border-slate-200/70 bg-white/90 shadow-none">
          <CardContent className={cn("flex flex-col gap-3", compact ? "px-4 py-4" : "px-6 py-5 md:flex-row md:items-center md:justify-between")}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Week drill-down</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">Weekly spend curve selection</p>
              <p className="mt-1 text-sm text-slate-600">Showing {filteredCount} transactions for week bucket {weekStartFilter}.</p>
            </div>
            <Link
              href="/transactions"
              className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              onClick={clearFilters}
            >
              Clear week filter
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function ReviewQueueCard({ reviewRows, compact }: { reviewRows: RawImportedRow[]; compact: boolean }) {
  return (
    <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
      <CardHeader>
        <CardTitle>Review queue</CardTitle>
        <CardDescription>Rows with low confidence, multiline truncation, or near-duplicate ambiguity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviewRows.length === 0 ? <EmptyStateCard text="No rows are waiting in the review queue." /> : null}
        {reviewRows.map((row) => (
          <div key={row.id} className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
            <div className={cn("flex flex-col gap-3", !compact && "md:flex-row md:items-center md:justify-between")}>
              <div>
                <p className="text-sm font-semibold text-slate-900">{row.draftDescription ?? row.rawText}</p>
                <p className="mt-1 text-xs text-slate-600">{row.reviewReason}</p>
              </div>
              <Badge className="w-fit rounded-full bg-amber-200 text-amber-900 hover:bg-amber-200">
                Confidence {(row.confidenceScore * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TransactionAnnotationBadges({
  annotation,
  className,
  compact = false,
}: {
  annotation?: TransactionAnnotation;
  className?: string;
  compact?: boolean;
}) {
  if (!annotation || (!annotation.note && annotation.tags.length === 0)) {
    return null;
  }

  const visibleTags = annotation.tags.slice(0, compact ? 2 : 3);
  const hiddenTagCount = annotation.tags.length - visibleTags.length;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {annotation.note ? (
        <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
          <MessageSquare className="size-3" />
          Note
        </Badge>
      ) : null}
      {visibleTags.map((tag) => (
        <Badge key={tag} variant="outline" className="rounded-full border-slate-200 bg-white text-slate-600">
          #{tag}
        </Badge>
      ))}
      {hiddenTagCount > 0 ? (
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500">
          +{hiddenTagCount}
        </Badge>
      ) : null}
    </div>
  );
}

function TransactionDetailSheet({
  selectedTransaction,
  setSelectedTransaction,
  annotationsByFingerprint,
  side,
}: {
  selectedTransaction: Transaction | null;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  annotationsByFingerprint: Map<string, TransactionAnnotation>;
  side: "right" | "bottom";
}) {
  const merchantLabel = selectedTransaction ? getTransactionMerchantLabel(selectedTransaction) : "";
  const descriptionLabel = selectedTransaction ? getTransactionDescriptionLabel(selectedTransaction) : "";
  const selectedAnnotation = selectedTransaction
    ? annotationsByFingerprint.get(selectedTransaction.transactionFingerprint)
    : undefined;
  const showRawNarration = Boolean(selectedTransaction && descriptionLabel !== selectedTransaction.description);

  return (
    <Sheet open={Boolean(selectedTransaction)} onOpenChange={(open) => (!open ? setSelectedTransaction(null) : null)}>
      <SheetContent
        side={side}
        className={cn(
          side === "bottom" ? "max-h-[85vh] rounded-t-[32px] border-t-slate-200" : "w-full border-l-slate-200 sm:max-w-lg",
        )}
      >
        <SheetHeader>
          <SheetTitle>Transaction detail</SheetTitle>
        </SheetHeader>
        {selectedTransaction ? (
          <div className="mt-2 space-y-4 px-4 pb-6 text-sm text-slate-600">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{selectedTransaction.date}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{merchantLabel}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{descriptionLabel}</p>
                </div>
                <p
                  className={cn(
                    "text-lg font-semibold",
                    selectedTransaction.direction === "credit" ? "text-emerald-700" : "text-slate-900",
                  )}
                >
                  {formatSignedAmount(selectedTransaction)}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                  {selectedTransaction.category}
                </Badge>
                <FlowBadge direction={selectedTransaction.direction} />
                <Badge variant="secondary" className="rounded-full bg-white capitalize text-slate-700">
                  {selectedTransaction.sourceType.replace("_", " ")}
                </Badge>
                <Badge variant="secondary" className="rounded-full bg-white capitalize text-slate-700">
                  {selectedTransaction.status.replace("_", " ")}
                </Badge>
              </div>
            </div>
            <TransactionAnnotationEditor
              key={`${selectedTransaction.transactionFingerprint}:${selectedAnnotation?.updatedAt ?? "new"}`}
              selectedTransaction={selectedTransaction}
              selectedAnnotation={selectedAnnotation}
            />
            <details className="group rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
                <div>
                  <p className="text-sm font-semibold text-slate-900">More details</p>
                  <p className="mt-1 text-xs text-slate-500">Import metadata and raw statement text.</p>
                </div>
                <div className="rounded-full bg-slate-100 p-2 text-slate-500 transition group-open:rotate-180">
                  <ChevronDown className="size-4" />
                </div>
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CompactMetaBlock label="Statement file" value={selectedTransaction.statementFileType.toUpperCase()} />
                <CompactMetaBlock label="Week bucket" value={selectedTransaction.weekLabel} />
                <CompactMetaBlock
                  label="Flow"
                  value={selectedTransaction.direction === "credit" ? "Incoming transaction" : "Outgoing transaction"}
                />
                <CompactMetaBlock label="Status" value={selectedTransaction.status.replace("_", " ")} />
              </div>
              {showRawNarration ? (
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Raw narration</p>
                  <p className="mt-1 font-medium text-slate-900">{selectedTransaction.description}</p>
                </div>
              ) : null}
            </details>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TransactionAnnotationEditor({
  selectedTransaction,
  selectedAnnotation,
}: {
  selectedTransaction: Transaction;
  selectedAnnotation?: TransactionAnnotation;
}) {
  const [draftNote, setDraftNote] = useState(selectedAnnotation?.note ?? "");
  const [draftTags, setDraftTags] = useState<string[]>(selectedAnnotation?.tags ?? []);
  const [draftTagInput, setDraftTagInput] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const normalizedDraftTags = normalizeTransactionAnnotationTags(draftTags);
  const storedTags = normalizeTransactionAnnotationTags(selectedAnnotation?.tags ?? []);
  const hasChanges =
    draftNote.trim() !== (selectedAnnotation?.note ?? "") || !areStringArraysEqual(normalizedDraftTags, storedTags);

  const handleAddTags = () => {
    const nextTags = mergeDraftAnnotationTags(draftTags, draftTagInput);

    if (nextTags.length === draftTags.length) {
      setDraftTagInput("");
      return;
    }

    setDraftTags(nextTags);
    setDraftTagInput("");
    setSaveState("idle");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setDraftTags((currentTags) => currentTags.filter((tag) => tag !== tagToRemove));
    setSaveState("idle");
  };

  const handleReset = () => {
    setDraftNote(selectedAnnotation?.note ?? "");
    setDraftTags(selectedAnnotation?.tags ?? []);
    setDraftTagInput("");
    setSaveState("idle");
  };

  const handleSave = async () => {
    try {
      await saveTransactionAnnotation({
        transactionFingerprint: selectedTransaction.transactionFingerprint,
        note: draftNote,
        tags: draftTags,
      });
      setDraftNote((currentNote) => currentNote.trim());
      setDraftTags(normalizedDraftTags);
      setDraftTagInput("");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Comment and tags</p>
          <p className="mt-1 text-sm text-slate-600">Saved to this transaction and shown back in your transaction list and search.</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
          <Tag className="size-4" />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transaction-note">
            Comment
          </label>
          <Textarea
            id="transaction-note"
            value={draftNote}
            onChange={(event) => {
              setDraftNote(event.target.value);
              setSaveState("idle");
            }}
            placeholder="Add a quick note for this transaction."
            className="min-h-20 rounded-2xl border-slate-200 bg-slate-50 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="transaction-tag-input">
            Tags
          </label>
          <div className="flex gap-2">
            <Input
              id="transaction-tag-input"
              value={draftTagInput}
              onChange={(event) => {
                setDraftTagInput(event.target.value);
                setSaveState("idle");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  handleAddTags();
                }
              }}
              placeholder="Type a tag and press Enter"
              className="rounded-2xl border-slate-200"
            />
            <Button type="button" variant="outline" className="rounded-2xl border-slate-200" onClick={handleAddTags}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {draftTags.length === 0 ? (
              <p className="text-sm text-slate-500">No tags yet.</p>
            ) : (
              draftTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                >
                  #{tag}
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`Remove ${tag} tag`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className={cn(
              "text-xs font-medium",
              saveState === "error" ? "text-rose-600" : saveState === "saved" ? "text-emerald-600" : "text-slate-500",
            )}
          >
            {saveState === "error"
              ? "Could not save your comment or tags."
              : saveState === "saved"
                ? "Saved. You will see it on this transaction in the list."
                : hasChanges
                  ? "Unsaved changes."
                  : "Clear both comment and tags, then save to remove them."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="rounded-2xl" onClick={handleReset} disabled={!hasChanges}>
              Reset
            </Button>
            <Button type="button" className="rounded-2xl" onClick={handleSave} disabled={!hasChanges}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactMetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function EmptyStateCard({ text }: { text: string }) {
  return <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">{text}</div>;
}

function FlowBadge({ direction }: { direction: Transaction["direction"] }) {
  return (
    <Badge
      className={cn(
        "rounded-full",
        direction === "credit"
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
          : "bg-slate-100 text-slate-700 hover:bg-slate-100",
      )}
    >
      {direction === "credit" ? "Incoming" : "Outgoing"}
    </Badge>
  );
}

function mergeDraftAnnotationTags(existingTags: string[], rawInput: string) {
  const inputTags = rawInput
    .split(/[\n,]/)
    .map((tag) => tag.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (inputTags.length === 0) {
    return existingTags;
  }

  return normalizeTransactionAnnotationTags([...existingTags, ...inputTags]);
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function matchesTransactionAnnotationFilter(annotation: TransactionAnnotation | undefined, annotationFilter: AnnotationFilter) {
  const hasComment = Boolean(annotation?.note.trim());
  const hasTags = Boolean(annotation?.tags.length);

  switch (annotationFilter) {
    case "comment":
      return hasComment;
    case "tags":
      return hasTags;
    case "both":
      return hasComment && hasTags;
    case "all":
    default:
      return true;
  }
}

function normalizeAnnotationFilter(value: string | null): AnnotationFilter {
  if (value === "comment" || value === "tags" || value === "both") {
    return value;
  }

  return "all";
}

function formatSignedAmount(transaction: Transaction) {
  return `${transaction.direction === "credit" ? "+" : "-"}${formatCurrency(Math.abs(transaction.signedAmount))}`;
}

function getTransactionQualifier(transaction: Transaction) {
  if (transaction.direction === "credit") {
    if (transaction.category === "Income") {
      return "Income";
    }

    if (transaction.category === "Refund") {
      return "Refund";
    }

    return "Incoming credit";
  }

  if (transaction.excludedFromSpend) {
    return "Excluded from spend totals";
  }

  return "Outgoing debit";
}

function SortIndicator({ active, direction }: { active: boolean; direction: "asc" | "desc" | null }) {
  if (!active || !direction) {
    return <ArrowUpDown className="size-3.5 text-slate-400" />;
  }

  return direction === "asc" ? <ArrowUp className="size-3.5 text-slate-700" /> : <ArrowDown className="size-3.5 text-slate-700" />;
}

function getSortDirection(sortOrder: string) {
  if (sortOrder.endsWith("asc")) {
    return "asc" as const;
  }

  if (sortOrder.endsWith("desc")) {
    return "desc" as const;
  }

  return null;
}

function getNextSortOrder(column: "date" | "amount", sortOrder: string) {
  if (sortOrder === `${column}-desc`) {
    return `${column}-asc`;
  }

  return `${column}-desc`;
}

function sortTransactions(left: Transaction, right: Transaction, sortOrder: string) {
  switch (sortOrder) {
    case "date-asc":
      return parseISO(left.date).getTime() - parseISO(right.date).getTime();
    case "amount-desc":
      return Math.abs(right.signedAmount) - Math.abs(left.signedAmount);
    case "amount-asc":
      return Math.abs(left.signedAmount) - Math.abs(right.signedAmount);
    case "date-desc":
    default:
      return parseISO(right.date).getTime() - parseISO(left.date).getTime();
  }
}

type LoadedTransactionsData = Exclude<ReturnType<typeof useTransactionsData>, { loading: true }>;
