"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRange } from "lucide-react";
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
  matchesTransactionPreset,
  type TransactionPreset,
} from "@/lib/finance";
import { db } from "@/lib/storage/db";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types/finance";

export function TransactionsView() {
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
    return <p className="text-sm text-slate-500">Loading transactions…</p>;
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
  const billingCyclePendingReviewCount = billingCycleSummaryRows.filter((transaction) => transaction.status === "pending_review").length;
  const presetMeta = preset ? getPresetMeta(preset, billingCycleStartDay) : null;
  const availableCategories = Array.from(new Set(transactions.map((transaction) => transaction.category))).sort();

  const filtered = transactions
    .filter((transaction) => {
      const matchesPreset = preset ? matchesTransactionPreset(transaction, preset, new Date(), billingCycleStartDay) : true;
      const matchesWeekStart = weekStartFilter ? transaction.weekStart === weekStartFilter : true;
      const matchesSearch =
        transaction.description.toLowerCase().includes(search.toLowerCase()) ||
        transaction.merchant.toLowerCase().includes(search.toLowerCase());
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
  const applyCurrentBillingCycleFilter = () => {
    setSourceFilter("credit_card");
    setFlowFilter("all");
    setFromDate(billingCycleWindow.startDate);
    setToDate(billingCycleWindow.throughDate);
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Transactions</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Inspect the canonical ledger.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            This table is reading the canonical ledger from IndexedDB. Search, source, flow, and dashboard preset filters
            are live; the current card billing cycle can also be pulled in directly from here without shifting over to a
            calendar month boundary.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">{filtered.length} visible rows</Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {reviewRows.length} review items
          </Badge>
        </div>
      </section>

      {presetMeta ? (
        <Card className="rounded-[24px] border-slate-200/70 bg-slate-950 text-white shadow-none">
          <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">KPI drill-down</p>
              <p className="mt-2 text-lg font-semibold">{presetMeta.label}</p>
              <p className="mt-1 text-sm text-slate-300">
                Showing {filtered.length} matching transactions. {presetMeta.description}
              </p>
            </div>
            <Link
              href="/transactions"
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-medium text-white transition hover:bg-white/10"
              onClick={() => {
                setSourceFilter("all");
                setFlowFilter("all");
                setCategoryFilter("all");
                clearDateFilters();
              }}
            >
              Clear preset
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {weekStartFilter ? (
        <Card className="rounded-[24px] border-slate-200/70 bg-white/90 shadow-none">
          <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Week drill-down</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">Weekly spend curve selection</p>
              <p className="mt-1 text-sm text-slate-600">Showing {filtered.length} transactions for week bucket {weekStartFilter}.</p>
            </div>
            <Link
              href="/transactions"
              className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              onClick={() => {
                setSourceFilter("all");
                setFlowFilter("all");
                setCategoryFilter("all");
                clearDateFilters();
              }}
            >
              Clear week filter
            </Link>
          </CardContent>
        </Card>
      ) : null}

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
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-end gap-2 rounded-[20px] border border-slate-200 bg-slate-50/90 p-2.5">
                  <label className="space-y-1 px-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Start
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="h-9 w-[148px] rounded-xl border-slate-200 bg-white text-sm"
                    />
                  </label>
                  <label className="space-y-1 px-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    End
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                      className="h-9 w-[148px] rounded-xl border-slate-200 bg-white text-sm"
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
                    {filtered.map((transaction) => (
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
                            <p className="font-medium text-slate-900">{transaction.merchant}</p>
                            <p className="text-xs text-slate-500">{transaction.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{transaction.category}</p>
                            <p className="text-xs text-slate-500">{getTransactionQualifier(transaction)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "rounded-full",
                              transaction.direction === "credit"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                            )}
                          >
                            {transaction.direction === "credit" ? "Incoming" : "Outgoing"}
                          </Badge>
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
                          {transaction.direction === "credit" ? "+" : "-"}
                          {formatCurrency(Math.abs(transaction.signedAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
            <CardHeader>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>Rows with low confidence, multiline truncation, or near-duplicate ambiguity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewRows.map((row) => (
                <div key={row.id} className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selectedTransaction)} onOpenChange={(open) => (!open ? setSelectedTransaction(null) : null)}>
        <SheetContent className="w-full border-l-slate-200 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Transaction detail</SheetTitle>
          </SheetHeader>
          {selectedTransaction ? (
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <DetailRow label="Merchant" value={selectedTransaction.merchant} />
              <DetailRow label="Description" value={selectedTransaction.description} />
              <DetailRow label="Category" value={selectedTransaction.category} />
              <DetailRow
                label="Flow"
                value={selectedTransaction.direction === "credit" ? "Incoming transaction" : "Outgoing transaction"}
              />
              <DetailRow label="Source" value={selectedTransaction.sourceType.replace("_", " ")} />
              <DetailRow label="Statement file" value={selectedTransaction.statementFileType.toUpperCase()} />
              <DetailRow label="Week bucket" value={selectedTransaction.weekLabel} />
              <DetailRow
                label="Amount"
                value={`${selectedTransaction.direction === "credit" ? "+" : "-"}${formatCurrency(Math.abs(selectedTransaction.signedAmount))}`}
              />
              <DetailRow label="Status" value={selectedTransaction.status} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
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
