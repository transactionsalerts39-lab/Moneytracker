"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, Funnel, Search } from "lucide-react";
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
import { db } from "@/lib/storage/db";
import { useViewportMode } from "@/lib/ui/viewport-mode";
import { cn } from "@/lib/utils";
import type { RawImportedRow, Transaction } from "@/types/finance";

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
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") ?? "all");
  const [flowFilter, setFlowFilter] = useState(searchParams.get("flow") ?? "all");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") ?? "all");
  const [sortOrder, setSortOrder] = useState("date-desc");
  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to") ?? "");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const preset = searchParams.get("preset") as TransactionPreset | null;
  const weekStartFilter = searchParams.get("weekStart");

  if (!transactions || !rawRows || !settings) {
    return { loading: true as const };
  }

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
      const merchantLabel = getTransactionMerchantLabel(transaction).toLowerCase();
      const descriptionLabel = getTransactionDescriptionLabel(transaction).toLowerCase();
      const rawDescription = transaction.description.toLowerCase();
      const matchesPreset = preset ? matchesTransactionPreset(transaction, preset, new Date(), billingCycleStartDay) : true;
      const matchesWeekStart = weekStartFilter ? transaction.weekStart === weekStartFilter : true;
      const matchesSearch =
        rawDescription.includes(search.toLowerCase()) ||
        descriptionLabel.includes(search.toLowerCase()) ||
        merchantLabel.includes(search.toLowerCase());
      const matchesSource = sourceFilter === "all" || transaction.sourceType === sourceFilter;
      const matchesFlow =
        flowFilter === "all" ||
        (flowFilter === "incoming" && transaction.direction === "credit") ||
        (flowFilter === "outgoing" && transaction.direction === "debit");
      const matchesCategory = categoryFilter === "all" || transaction.category === categoryFilter;
      const matchesFromDate = !fromDate || transaction.date >= fromDate;
      const matchesToDate = !toDate || transaction.date <= toDate;

      return (
        matchesPreset &&
        matchesWeekStart &&
        matchesSearch &&
        matchesSource &&
        matchesFlow &&
        matchesCategory &&
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
    clearDateFilters();
  };

  const applyCurrentBillingCycleFilter = () => {
    setSourceFilter("credit_card");
    setFlowFilter("all");
    setFromDate(billingCycleWindow.startDate);
    setToDate(billingCycleWindow.throughDate);
  };

  const activeFilterCount = [sourceFilter !== "all", flowFilter !== "all", categoryFilter !== "all", Boolean(fromDate), Boolean(toDate)].filter(
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
                <CardDescription>Search by merchant or description and drill into the canonical record.</CardDescription>
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
                  placeholder="Search merchant or description"
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
          Search, filter, and review the canonical IndexedDB ledger without changing how desktop behaves.
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
  availableCategories: string[];
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search merchant or description"
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

function TransactionDetailSheet({
  selectedTransaction,
  setSelectedTransaction,
  side,
}: {
  selectedTransaction: Transaction | null;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  side: "right" | "bottom";
}) {
  const merchantLabel = selectedTransaction ? getTransactionMerchantLabel(selectedTransaction) : "";
  const descriptionLabel = selectedTransaction ? getTransactionDescriptionLabel(selectedTransaction) : "";
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
            <DetailRow label="Merchant" value={merchantLabel} />
            <DetailRow label="Description" value={descriptionLabel} />
            {showRawNarration ? <DetailRow label="Raw narration" value={selectedTransaction.description} /> : null}
            <DetailRow label="Category" value={selectedTransaction.category} />
            <DetailRow
              label="Flow"
              value={selectedTransaction.direction === "credit" ? "Incoming transaction" : "Outgoing transaction"}
            />
            <DetailRow label="Source" value={selectedTransaction.sourceType.replace("_", " ")} />
            <DetailRow label="Statement file" value={selectedTransaction.statementFileType.toUpperCase()} />
            <DetailRow label="Week bucket" value={selectedTransaction.weekLabel} />
            <DetailRow label="Amount" value={formatSignedAmount(selectedTransaction)} />
            <DetailRow label="Status" value={selectedTransaction.status} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
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
