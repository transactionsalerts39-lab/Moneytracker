"use client";

import { useState } from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format as formatDate,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  addMonths,
} from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildCategorySeries,
  buildMonthSeries,
  buildSourceSplit,
  buildWeeklySeries,
  filterTransactionsByDateRange,
  formatDateRangeLabel,
  formatCompactCurrency,
  formatCurrency,
  getBillingCycleStartDay,
  getDashboardDateRangeMetrics,
  getDashboardMetrics,
  getTopMerchants,
  matchesTransactionPreset,
  normalizeDateRange,
} from "@/lib/finance";
import { db } from "@/lib/storage/db";
import { useViewportMode } from "@/lib/ui/viewport-mode";
import { cn } from "@/lib/utils";

const sourceColors = ["#0f172a", "#94a3b8"];

type DashboardKpi = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: string;
  href?: string;
  detail?: string;
  matchingCount: number | null;
};

export function DashboardView() {
  const { resolvedMode } = useViewportMode();
  const data = useDashboardData();

  if (data.loading) {
    return <p className="text-sm text-slate-500">Loading your local dashboard…</p>;
  }

  return resolvedMode === "mobile" ? <MobileDashboardView {...data} /> : <DesktopDashboardView {...data} />;
}

function useDashboardData() {
  const router = useRouter();
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const importBatches = useLiveQuery(() => db.importBatches.toArray(), []);
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  if (!transactions || !settings) {
    return { loading: true as const };
  }

  const billingCycleStartDay = getBillingCycleStartDay(settings);
  const normalizedRange = normalizeDateRange(fromDate, toDate);
  const scopedTransactions = filterTransactionsByDateRange(transactions, normalizedRange.fromDate, normalizedRange.toDate);
  const metrics = getDashboardMetrics(transactions, billingCycleStartDay);
  const rangeMetrics = normalizedRange.isActive ? getDashboardDateRangeMetrics(scopedTransactions) : null;
  const includePendingReviewInRange = normalizedRange.isActive;
  const weeklySeries = buildWeeklySeries(scopedTransactions, includePendingReviewInRange);
  const categorySeries = buildCategorySeries(scopedTransactions, includePendingReviewInRange);
  const sourceSplit = buildSourceSplit(scopedTransactions, includePendingReviewInRange);
  const monthSeries = buildMonthSeries(scopedTransactions, includePendingReviewInRange);
  const merchants = getTopMerchants(scopedTransactions, includePendingReviewInRange);
  const dateRangeLabel = formatDateRangeLabel(normalizedRange.fromDate, normalizedRange.toDate);
  const buildTransactionsHref = (params: Record<string, string>) => {
    const query = new URLSearchParams(params);

    if (normalizedRange.fromDate && !query.has("from")) {
      query.set("from", normalizedRange.fromDate);
    }

    if (normalizedRange.toDate && !query.has("to")) {
      query.set("to", normalizedRange.toDate);
    }

    return `/transactions?${query.toString()}`;
  };
  const goToTransactions = (params: Record<string, string>) => {
    router.push(buildTransactionsHref(params));
  };
  const clearDateRange = () => {
    setFromDate("");
    setToDate("");
  };

  const kpis: DashboardKpi[] = normalizedRange.isActive && rangeMetrics
    ? [
        {
          label: "Spend in range",
          value: formatCurrency(rangeMetrics.totalSpend),
          icon: ArrowDownRight,
          tone: "text-rose-500",
          detail: dateRangeLabel,
          href: buildTransactionsHref({ flow: "outgoing" }),
          matchingCount: rangeMetrics.spendTransactionCount,
        },
        {
          label: "Income in range",
          value: formatCurrency(rangeMetrics.incomeTotal),
          icon: ArrowUpRight,
          tone: "text-emerald-600",
          href: buildTransactionsHref({ flow: "incoming", category: "Income" }),
          detail: "Active income only",
          matchingCount: rangeMetrics.incomeTransactionCount,
        },
        {
          label: "Expense transactions",
          value: `${rangeMetrics.spendTransactionCount}`,
          icon: Sparkles,
          tone: "text-slate-900",
          href: buildTransactionsHref({ flow: "outgoing" }),
          detail: "Included debit spend only",
          matchingCount: rangeMetrics.spendTransactionCount,
        },
        {
          label: "Savings spend",
          value: formatCurrency(rangeMetrics.savingsSpend),
          icon: Landmark,
          tone: "text-indigo-600",
          href: buildTransactionsHref({ source: "savings", flow: "outgoing" }),
          matchingCount: scopedTransactions.filter(
            (transaction) =>
              transaction.sourceType === "savings" &&
              transaction.direction === "debit" &&
              !transaction.excludedFromSpend &&
              transaction.status !== "excluded",
          ).length,
        },
        {
          label: "Credit card spend",
          value: formatCurrency(rangeMetrics.creditCardSpend),
          icon: CreditCard,
          tone: "text-orange-500",
          href: buildTransactionsHref({ source: "credit_card", flow: "outgoing" }),
          matchingCount: scopedTransactions.filter(
            (transaction) =>
              transaction.sourceType === "credit_card" &&
              transaction.direction === "debit" &&
              !transaction.excludedFromSpend &&
              transaction.status !== "excluded",
          ).length,
        },
        {
          label: "Pending review",
          value: `${rangeMetrics.pendingReviewCount}`,
          icon: TrendingUp,
          tone: rangeMetrics.pendingReviewCount > 0 ? "text-amber-600" : "text-slate-400",
          detail: "Rows still needing confirmation",
          href: rangeMetrics.pendingReviewCount > 0 ? buildTransactionsHref({}) : undefined,
          matchingCount: null,
        },
      ]
    : [
        {
          label: "Spend this week",
          value: formatCurrency(metrics.currentWeek),
          icon: ArrowDownRight,
          tone: "text-rose-500",
          href: "/transactions?preset=spend-this-week",
          matchingCount: transactions.filter((transaction) =>
            matchesTransactionPreset(transaction, "spend-this-week", new Date(), billingCycleStartDay),
          ).length,
        },
        {
          label: "Spend last week",
          value: formatCurrency(metrics.lastWeek),
          icon: ArrowUpRight,
          tone: "text-slate-600",
          href: "/transactions?preset=spend-last-week",
          matchingCount: transactions.filter((transaction) =>
            matchesTransactionPreset(transaction, "spend-last-week", new Date(), billingCycleStartDay),
          ).length,
        },
        {
          label: "Week-on-week",
          value: `${metrics.wowChange.toFixed(1)}%`,
          icon: TrendingUp,
          tone: metrics.wowChange > 0 ? "text-rose-500" : "text-emerald-600",
          matchingCount: null,
        },
        {
          label: "Month to date",
          value: formatCurrency(metrics.monthToDate),
          icon: Sparkles,
          tone: "text-slate-900",
          href: "/transactions?preset=month-to-date",
          matchingCount: transactions.filter((transaction) =>
            matchesTransactionPreset(transaction, "month-to-date", new Date(), billingCycleStartDay),
          ).length,
        },
        {
          label: "Income this month",
          value: formatCurrency(metrics.incomeThisMonth),
          icon: ArrowUpRight,
          tone: "text-emerald-600",
          href: "/transactions?flow=incoming&category=Income",
          detail: "Active income only",
          matchingCount: metrics.incomeTransactionCount,
        },
        {
          label: "Savings spend",
          value: formatCurrency(metrics.savingsSpend),
          icon: Landmark,
          tone: "text-indigo-600",
          href: "/transactions?preset=savings-spend",
          matchingCount: transactions.filter((transaction) =>
            matchesTransactionPreset(transaction, "savings-spend", new Date(), billingCycleStartDay),
          ).length,
        },
        {
          label: "Credit card spend",
          value: formatCurrency(metrics.creditCardSpend),
          icon: CreditCard,
          tone: "text-orange-500",
          href: "/transactions?preset=credit-card-spend",
          matchingCount: transactions.filter((transaction) =>
            matchesTransactionPreset(transaction, "credit-card-spend", new Date(), billingCycleStartDay),
          ).length,
        },
        {
          label: "Current card cycle",
          value: formatCurrency(metrics.currentBillingCycle.amountDue),
          icon: CalendarRange,
          tone: "text-cyan-700",
          href: "/transactions?preset=current-billing-cycle",
          detail: `${metrics.currentBillingCycle.window.activeRangeLabel} • next cutoff ${metrics.currentBillingCycle.window.cutoffLabel}`,
          matchingCount: metrics.currentBillingCycle.transactionCount,
        },
      ];

  return {
    loading: false as const,
    transactions: scopedTransactions,
    totalTransactionCount: transactions.length,
    importBatchCount: importBatches?.length ?? 0,
    metrics,
    rangeMetrics,
    weeklySeries,
    categorySeries,
    sourceSplit,
    monthSeries,
    merchants,
    kpis,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    clearDateRange,
    isDateRangeActive: normalizedRange.isActive,
    dateRangeLabel,
    goToTransactions,
  };
}

function DesktopDashboardView({
  transactions,
  totalTransactionCount,
  importBatchCount,
  metrics,
  rangeMetrics,
  weeklySeries,
  categorySeries,
  sourceSplit,
  monthSeries,
  merchants,
  kpis,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  clearDateRange,
  isDateRangeActive,
  dateRangeLabel,
  goToTransactions,
}: Exclude<ReturnType<typeof useDashboardData>, { loading: true }>) {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Dashboard</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            {isDateRangeActive ? "Custom date window, same local dashboard." : "Week-on-week spending, kept local."}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {isDateRangeActive
              ? `All KPI cards, charts, and drill-down links are now scoped to ${dateRangeLabel}. Clear the dates to return to the default rolling dashboard.`
              : "This prototype is already reading from local IndexedDB with seeded demo imports that mirror your ICICI savings and credit-card workflows. Billing-cycle totals can now anchor to your chosen cycle day, and repeated uploads still reconcile against canonical fingerprints before they affect KPIs."}
          </p>
        </div>
        <div className="space-y-3">
          <DashboardDateRangePicker
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
            clearDateRange={clearDateRange}
            compact={false}
          />
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
              {transactions.length} {isDateRangeActive ? "transactions in range" : "canonical transactions"}
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-slate-700">
              {importBatchCount} import batches
            </Badge>
            {isDateRangeActive ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-slate-700">
                {totalTransactionCount} total canonical transactions
              </Badge>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Weekly spend curve</CardTitle>
            <CardDescription>
              {isDateRangeActive
                ? "The selected range still groups spend into Monday-Sunday buckets."
                : "Monday-Sunday buckets derived from transaction dates, not upload timestamps."}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySeries}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis
                  tickFormatter={(value) => formatCompactCurrency(value)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip formatter={(value) => formatTooltipValue(value)} />
                <Bar
                  dataKey="total"
                  radius={[12, 12, 0, 0]}
                  fill="#0f172a"
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const weekStart = (entry as { weekStart?: string } | undefined)?.weekStart;

                    if (weekStart) {
                      goToTransactions({ weekStart, flow: "outgoing" });
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/70 bg-slate-950 text-white shadow-none">
          <CardHeader>
            <CardTitle>Signal board</CardTitle>
            <CardDescription className="text-slate-300">
              {isDateRangeActive ? `A quick read of ${dateRangeLabel}.` : "A quick view of what moved this week."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {isDateRangeActive && rangeMetrics ? (
              <>
                <InsightRow
                  label="Top expense category"
                  value={`${rangeMetrics.topCategory.name} • ${formatCurrency(rangeMetrics.topCategory.amount)}`}
                />
                <InsightRow
                  label="Biggest expense merchant"
                  value={`${rangeMetrics.biggestMerchant.name} • ${formatCurrency(rangeMetrics.biggestMerchant.amount)}`}
                />
                <InsightRow
                  label="Income in range"
                  value={
                    rangeMetrics.incomeTransactionCount > 0
                      ? `${formatCurrency(rangeMetrics.incomeTotal)} • ${rangeMetrics.incomeTransactionCount} income transactions`
                      : "No income in this window"
                  }
                />
                <InsightRow
                  label="Net cash impact"
                  value={
                    rangeMetrics.totalIncomingCredits > 0 || rangeMetrics.totalSpend > 0
                      ? `${formatCurrency(rangeMetrics.netFlow)} • credits minus spend`
                      : "No cash movement in this window"
                  }
                />
              </>
            ) : (
              <>
                <InsightRow label="Top category this month" value={`${metrics.topCategory.name} • ${formatCurrency(metrics.topCategory.amount)}`} />
                <InsightRow label="Biggest merchant" value={`${metrics.biggestMerchant.name} • ${formatCurrency(metrics.biggestMerchant.amount)}`} />
                <InsightRow
                  label="Largest transaction this week"
                  value={
                    metrics.largestTransaction
                      ? `${metrics.largestTransaction.merchant} • ${formatCurrency(Math.abs(metrics.largestTransaction.signedAmount))}`
                      : "No spend yet"
                  }
                />
                <InsightRow
                  label="Spend mix"
                  value={metrics.creditCardSpend > metrics.savingsSpend ? "Card-heavy this month" : "Bank-heavy this month"}
                />
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr_0.9fr]">
        <SourceSplitCard sourceSplit={sourceSplit} goToTransactions={goToTransactions} />

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Category mix</CardTitle>
            <CardDescription>
              {isDateRangeActive ? "Top spend categories inside the selected date window." : "Finance charges stay visible as a separate category."}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySeries} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#475569", fontSize: 12 }}
                  width={110}
                />
                <Tooltip formatter={(value) => formatTooltipValue(value)} />
                <Bar
                  dataKey="value"
                  radius={[0, 12, 12, 0]}
                  fill="#334155"
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const name = (entry as { name?: string } | undefined)?.name;

                    if (name) {
                      goToTransactions({ category: name, flow: "outgoing" });
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Monthly trend</CardTitle>
            <CardDescription>
              {isDateRangeActive ? "Only months touched by the selected range remain in the trend." : "Month-to-date total lines up against previous months."}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthSeries}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatTooltipValue(value)} />
                <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <TopMerchantsCard merchants={merchants} dateRangeLabel={dateRangeLabel} isDateRangeActive={isDateRangeActive} />

        <Card className="rounded-[28px] border-dashed border-slate-300 bg-slate-50/80 shadow-none">
          <CardHeader>
            <CardTitle>What’s next in execution</CardTitle>
            <CardDescription>The main local import pipeline is live; the next slice tightens review and override workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>1. Add review queue actions for ambiguous rows and near-duplicate resolution.</p>
            <p>2. Save per-user preferences like billing-cycle day and chart visibility with lighter settings UX.</p>
            <p>3. Add manual CSV/XLSX mapping fallback for statements that do not match the saved header signatures.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MobileDashboardView({
  transactions,
  totalTransactionCount,
  importBatchCount,
  metrics,
  rangeMetrics,
  weeklySeries,
  categorySeries,
  sourceSplit,
  monthSeries,
  merchants,
  kpis,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  clearDateRange,
  isDateRangeActive,
  dateRangeLabel,
  goToTransactions,
}: Exclude<ReturnType<typeof useDashboardData>, { loading: true }>) {
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/80 bg-white/90 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">Dashboard</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          {isDateRangeActive ? "Quick range scan" : "Quick spend scan"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isDateRangeActive
            ? `Every dashboard number below is filtered to ${dateRangeLabel}.`
            : "Local metrics, mobile drill-downs, and billing-cycle totals without changing the desktop workflow."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
            {transactions.length} {isDateRangeActive ? "in range" : "transactions"}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-slate-700">
            {importBatchCount} batches
          </Badge>
          {isDateRangeActive ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-slate-700">
              {totalTransactionCount} total
            </Badge>
          ) : null}
        </div>
        <div className="mt-4">
          <DashboardDateRangePicker
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
            clearDateRange={clearDateRange}
            compact
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} compact />
        ))}
      </section>

      <Card className="rounded-[28px] border-slate-200/70 bg-slate-950 text-white shadow-none">
        <CardHeader>
          <CardTitle>{isDateRangeActive ? "Selected range" : "This week’s signal board"}</CardTitle>
          <CardDescription className="text-slate-300">
            {isDateRangeActive ? "The quickest mobile read of the filtered window." : "The quickest mobile read of what changed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isDateRangeActive && rangeMetrics ? (
            <>
              <InsightRow
                label="Top expense category"
                value={`${rangeMetrics.topCategory.name} • ${formatCurrency(rangeMetrics.topCategory.amount)}`}
              />
              <InsightRow
                label="Income in range"
                value={
                  rangeMetrics.incomeTransactionCount > 0
                    ? `${formatCurrency(rangeMetrics.incomeTotal)} • ${rangeMetrics.incomeTransactionCount} income`
                    : "No income"
                }
              />
              <InsightRow
                label="Net cash impact"
                value={
                  rangeMetrics.totalIncomingCredits > 0 || rangeMetrics.totalSpend > 0
                    ? `${formatCurrency(rangeMetrics.netFlow)} • credits minus spend`
                    : "No cash movement"
                }
              />
            </>
          ) : (
            <>
              <InsightRow label="Top category" value={`${metrics.topCategory.name} • ${formatCurrency(metrics.topCategory.amount)}`} />
              <InsightRow label="Biggest merchant" value={`${metrics.biggestMerchant.name} • ${formatCurrency(metrics.biggestMerchant.amount)}`} />
              <InsightRow
                label="Card cycle"
                value={`${formatCurrency(metrics.currentBillingCycle.amountDue)} • ${metrics.currentBillingCycle.window.activeRangeLabel}`}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
        <CardHeader>
          <CardTitle>Weekly spend curve</CardTitle>
          <CardDescription>
            {isDateRangeActive ? "Tap a bar to open that week inside the selected date window." : "Tap a bar to open the matching ledger slice."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklySeries}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => formatTooltipValue(value)} />
              <Bar
                dataKey="total"
                radius={[12, 12, 0, 0]}
                fill="#0f172a"
                onClick={(entry) => {
                  const weekStart = (entry as { weekStart?: string } | undefined)?.weekStart;

                  if (weekStart) {
                    goToTransactions({ weekStart, flow: "outgoing" });
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <SourceSplitCard sourceSplit={sourceSplit} goToTransactions={goToTransactions} compact />

      <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
        <CardHeader>
          <CardTitle>Category mix</CardTitle>
          <CardDescription>
            {isDateRangeActive ? "Tap a bar to drill into this filtered date window." : "Tap a bar to filter by outgoing category."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categorySeries.slice(0, 6)} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11 }} width={88} />
              <Tooltip formatter={(value) => formatTooltipValue(value)} />
              <Bar
                dataKey="value"
                radius={[0, 12, 12, 0]}
                fill="#334155"
                onClick={(entry) => {
                  const name = (entry as { name?: string } | undefined)?.name;

                  if (name) {
                    goToTransactions({ category: name, flow: "outgoing" });
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
        <CardHeader>
          <CardTitle>Monthly trend</CardTitle>
          <CardDescription>
            {isDateRangeActive ? "The trend now reflects only months inside the selected range." : "Month-to-date spend against prior months."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthSeries}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis hide />
              <Tooltip formatter={(value) => formatTooltipValue(value)} />
              <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <TopMerchantsCard merchants={merchants} dateRangeLabel={dateRangeLabel} isDateRangeActive={isDateRangeActive} compact />
    </div>
  );
}

function KpiCard({ kpi, compact = false }: { kpi: DashboardKpi; compact?: boolean }) {
  const Icon = kpi.icon;
  const cardContent = (
    <Card
      className={cn(
        "rounded-[24px] border-slate-200/70 bg-white/90 shadow-none transition",
        kpi.href && "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]",
      )}
      size={compact ? "sm" : "default"}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardDescription>{kpi.label}</CardDescription>
          <CardTitle className={cn("mt-2 tracking-tight", compact ? "text-xl" : "text-2xl")}>{kpi.value}</CardTitle>
          {kpi.detail ? <p className="mt-2 text-xs font-medium text-slate-500">{kpi.detail}</p> : null}
          {kpi.matchingCount !== null ? (
            <p className="mt-2 text-xs font-medium text-slate-500">{kpi.matchingCount} matching transactions</p>
          ) : null}
        </div>
        <div className="rounded-2xl bg-slate-100 p-2.5">
          <Icon className={cn("size-4", kpi.tone)} />
        </div>
      </CardHeader>
    </Card>
  );

  if (!kpi.href) {
    return cardContent;
  }

  return (
    <Link href={kpi.href} className="block">
      {cardContent}
    </Link>
  );
}

function DashboardDateRangePicker({
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  clearDateRange,
  compact,
}: {
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  clearDateRange: () => void;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedStartDate = fromDate ? parseISO(fromDate) : null;
  const selectedEndDate = toDate ? parseISO(toDate) : null;
  const [displayMonth, setDisplayMonth] = useState(() =>
    startOfMonth(selectedStartDate ?? selectedEndDate ?? new Date()),
  );
  const hasActiveRange = Boolean(fromDate || toDate);
  const label = hasActiveRange ? formatDateRangeLabel(fromDate, toDate) : "Custom dates";
  const calendarWeeks = buildCalendarWeeks(displayMonth);

  const handleDaySelect = (day: Date) => {
    const selectedIsoDate = formatDate(day, "yyyy-MM-dd");

    if (!selectedStartDate || selectedEndDate) {
      setFromDate(selectedIsoDate);
      setToDate("");
      return;
    }

    if (isBefore(day, selectedStartDate)) {
      setFromDate(selectedIsoDate);
      return;
    }

    setToDate(selectedIsoDate);
    setOpen(false);
  };

  const handleClear = () => {
    clearDateRange();
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (nextOpen) {
          setDisplayMonth(startOfMonth(selectedStartDate ?? selectedEndDate ?? new Date()));
        }
      }}
    >
      <Popover.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition outline-none",
          "border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-white",
          "focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200",
          compact ? "w-full justify-between px-3.5 py-2.5" : "self-end",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <span className={cn("rounded-full p-1", hasActiveRange ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500")}>
            <CalendarRange className="size-3.5" />
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          {hasActiveRange ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Live
            </span>
          ) : null}
          <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={10} align={compact ? "center" : "end"} className="z-50">
          <Popover.Popup
            initialFocus
            className={cn(
              "w-[min(92vw,360px)] rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)] outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Date range</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{label}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    onClick={() => setDisplayMonth((currentMonth) => subMonths(currentMonth, 1))}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    onClick={() => setDisplayMonth((currentMonth) => addMonths(currentMonth, 1))}
                    aria-label="Next month"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-[22px] bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-lg font-semibold tracking-tight text-slate-900">{formatDate(displayMonth, "MMMM yyyy")}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {selectedStartDate && !selectedEndDate ? "Select end" : "Select range"}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-y-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                  {WEEKDAY_LABELS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>

                <div className="mt-2 space-y-1.5">
                  {calendarWeeks.map((week) => (
                    <div key={week[0].toISOString()} className="grid grid-cols-7 gap-0.5">
                      {week.map((day, dayIndex) => {
                        const isCurrentMonth = isSameMonth(day, displayMonth);
                        const isSelectedStart = Boolean(selectedStartDate && isSameDay(day, selectedStartDate));
                        const isSelectedEnd = Boolean(selectedEndDate && isSameDay(day, selectedEndDate));
                        const isRangeDay = Boolean(
                          selectedStartDate &&
                            selectedEndDate &&
                            isWithinInterval(day, { start: selectedStartDate, end: selectedEndDate }),
                        );
                        const isPreviewDay = Boolean(selectedStartDate && !selectedEndDate && isSameDay(day, selectedStartDate));

                        return (
                          <div
                            key={day.toISOString()}
                            className={cn(
                              "flex h-10 items-center justify-center",
                              (isRangeDay || isPreviewDay) && "bg-sky-100/90",
                              (isSelectedStart || (isRangeDay && dayIndex === 0)) && "rounded-l-full",
                              (isSelectedEnd || (isRangeDay && dayIndex === 6) || isPreviewDay) && "rounded-r-full",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => handleDaySelect(day)}
                              className={cn(
                                "flex size-9 items-center justify-center rounded-full text-sm font-medium transition",
                                isSelectedStart || isSelectedEnd
                                  ? "bg-sky-500 text-white shadow-[0_8px_18px_rgba(14,116,144,0.28)]"
                                  : isRangeDay
                                    ? "text-sky-900 hover:bg-sky-200/80"
                                    : "text-slate-700 hover:bg-white",
                                !isCurrentMonth && !(isSelectedStart || isSelectedEnd) && "text-slate-300",
                                selectedStartDate &&
                                  !selectedEndDate &&
                                  isAfter(day, selectedStartDate) &&
                                  "hover:bg-sky-100 hover:text-sky-900",
                              )}
                              aria-pressed={isSelectedStart || isSelectedEnd}
                            >
                              {formatDate(day, "d")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-full px-3" onClick={handleClear}>
                  Clear
                </Button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildCalendarWeeks(displayMonth: Date) {
  const calendarStart = startOfWeek(startOfMonth(displayMonth), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(displayMonth), { weekStartsOn: 1 });
  const weeks: Date[][] = [];

  let currentDay = calendarStart;

  while (currentDay <= calendarEnd) {
    const week: Date[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      week.push(currentDay);
      currentDay = addDays(currentDay, 1);
    }

    weeks.push(week);
  }

  return weeks;
}

function SourceSplitCard({
  sourceSplit,
  goToTransactions,
  compact = false,
}: {
  sourceSplit: { name: string; value: number }[];
  goToTransactions: (params: Record<string, string>) => void;
  compact?: boolean;
}) {
  return (
    <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
      <CardHeader>
        <CardTitle>Source split</CardTitle>
        <CardDescription>Included spend only.</CardDescription>
      </CardHeader>
      <CardContent className={cn(compact ? "h-[240px]" : "h-[280px]")}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={sourceSplit}
              dataKey="value"
              nameKey="name"
              innerRadius={compact ? 50 : 70}
              outerRadius={compact ? 76 : 96}
              paddingAngle={4}
              className="cursor-pointer"
              onClick={(entry) => {
                const name = (entry as { name?: string } | undefined)?.name;

                if (name) {
                  goToTransactions({
                    source: name === "Savings" ? "savings" : "credit_card",
                    flow: "outgoing",
                  });
                }
              }}
            >
              {sourceSplit.map((entry, index) => (
                <Cell key={entry.name} fill={sourceColors[index % sourceColors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatTooltipValue(value)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 gap-2">
          {sourceSplit.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className="rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100"
              onClick={() =>
                goToTransactions({
                  source: item.name === "Savings" ? "savings" : "credit_card",
                  flow: "outgoing",
                })
              }
            >
              <p className="text-xs text-slate-500">{item.name}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(item.value)}</p>
              <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: sourceColors[index % sourceColors.length] }} />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopMerchantsCard({
  merchants,
  dateRangeLabel,
  isDateRangeActive,
  compact = false,
}: {
  merchants: { merchant: string; total: number }[];
  dateRangeLabel: string;
  isDateRangeActive: boolean;
  compact?: boolean;
}) {
  return (
    <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
      <CardHeader>
        <CardTitle>Top merchants</CardTitle>
        <CardDescription>
          {isDateRangeActive ? `Included outflows for ${dateRangeLabel}.` : "Current month-to-date included outflows."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {merchants.slice(0, compact ? 4 : merchants.length).map((merchant, index) => (
          <div key={merchant.merchant} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {index + 1}. {merchant.merchant}
              </p>
              <p className="text-xs text-slate-500">Recurring spend candidate</p>
            </div>
            <p className="text-sm font-semibold text-slate-900">{formatCurrency(merchant.total)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function formatTooltipValue(value: string | number | readonly (string | number)[] | undefined) {
  if (typeof value === "number") {
    return formatCurrency(value);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value ?? "N/A";
}
