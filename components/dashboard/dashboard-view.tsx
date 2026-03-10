"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildCategorySeries,
  buildMonthSeries,
  buildSourceSplit,
  buildWeeklySeries,
  formatCompactCurrency,
  formatCurrency,
  getBillingCycleStartDay,
  getDashboardMetrics,
  getTopMerchants,
  matchesTransactionPreset,
  type TransactionPreset,
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
  preset?: TransactionPreset;
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

  if (!transactions || !settings) {
    return { loading: true as const };
  }

  const billingCycleStartDay = getBillingCycleStartDay(settings);
  const metrics = getDashboardMetrics(transactions, billingCycleStartDay);
  const weeklySeries = buildWeeklySeries(transactions);
  const categorySeries = buildCategorySeries(transactions);
  const sourceSplit = buildSourceSplit(transactions);
  const monthSeries = buildMonthSeries(transactions);
  const merchants = getTopMerchants(transactions);
  const goToTransactions = (params: Record<string, string>) => {
    const query = new URLSearchParams(params);
    router.push(`/transactions?${query.toString()}`);
  };

  const kpis: DashboardKpi[] = [
    {
      label: "Spend this week",
      value: formatCurrency(metrics.currentWeek),
      icon: ArrowDownRight,
      tone: "text-rose-500",
      preset: "spend-this-week",
      matchingCount: transactions.filter((transaction) =>
        matchesTransactionPreset(transaction, "spend-this-week", new Date(), billingCycleStartDay),
      ).length,
    },
    {
      label: "Spend last week",
      value: formatCurrency(metrics.lastWeek),
      icon: ArrowUpRight,
      tone: "text-slate-600",
      preset: "spend-last-week",
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
      preset: "month-to-date",
      matchingCount: transactions.filter((transaction) =>
        matchesTransactionPreset(transaction, "month-to-date", new Date(), billingCycleStartDay),
      ).length,
    },
    {
      label: "Savings spend",
      value: formatCurrency(metrics.savingsSpend),
      icon: Landmark,
      tone: "text-indigo-600",
      preset: "savings-spend",
      matchingCount: transactions.filter((transaction) =>
        matchesTransactionPreset(transaction, "savings-spend", new Date(), billingCycleStartDay),
      ).length,
    },
    {
      label: "Credit card spend",
      value: formatCurrency(metrics.creditCardSpend),
      icon: CreditCard,
      tone: "text-orange-500",
      preset: "credit-card-spend",
      matchingCount: transactions.filter((transaction) =>
        matchesTransactionPreset(transaction, "credit-card-spend", new Date(), billingCycleStartDay),
      ).length,
    },
    {
      label: "Current card cycle",
      value: formatCurrency(metrics.currentBillingCycle.amountDue),
      icon: CalendarRange,
      tone: "text-cyan-700",
      preset: "current-billing-cycle",
      detail: `${metrics.currentBillingCycle.window.activeRangeLabel} • next cutoff ${metrics.currentBillingCycle.window.cutoffLabel}`,
      matchingCount: transactions.filter((transaction) =>
        matchesTransactionPreset(transaction, "current-billing-cycle", new Date(), billingCycleStartDay),
      ).length,
    },
  ];

  return {
    loading: false as const,
    transactions,
    importBatchCount: importBatches?.length ?? 0,
    metrics,
    weeklySeries,
    categorySeries,
    sourceSplit,
    monthSeries,
    merchants,
    kpis,
    goToTransactions,
  };
}

function DesktopDashboardView({
  transactions,
  importBatchCount,
  metrics,
  weeklySeries,
  categorySeries,
  sourceSplit,
  monthSeries,
  merchants,
  kpis,
  goToTransactions,
}: Exclude<ReturnType<typeof useDashboardData>, { loading: true }>) {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-b border-slate-200/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Dashboard</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Week-on-week spending, kept local.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            This prototype is already reading from local IndexedDB with seeded demo imports that mirror your ICICI savings
            and credit-card workflows. Billing-cycle totals can now anchor to your chosen cycle day, and repeated uploads
            still reconcile against canonical fingerprints before they affect KPIs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
            {transactions.length} canonical transactions
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-slate-700">
            {importBatchCount} import batches
          </Badge>
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
            <CardDescription>Monday-Sunday buckets derived from transaction dates, not upload timestamps.</CardDescription>
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
            <CardDescription className="text-slate-300">A quick view of what moved this week.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
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
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr_0.9fr]">
        <SourceSplitCard sourceSplit={sourceSplit} goToTransactions={goToTransactions} />

        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Category mix</CardTitle>
            <CardDescription>Finance charges stay visible as a separate category.</CardDescription>
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
            <CardDescription>Month-to-date total lines up against previous months.</CardDescription>
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
        <TopMerchantsCard merchants={merchants} />

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
  importBatchCount,
  metrics,
  weeklySeries,
  categorySeries,
  sourceSplit,
  monthSeries,
  merchants,
  kpis,
  goToTransactions,
}: Exclude<ReturnType<typeof useDashboardData>, { loading: true }>) {
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/80 bg-white/90 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">Dashboard</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Quick spend scan</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Local metrics, mobile drill-downs, and billing-cycle totals without changing the desktop workflow.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white hover:bg-slate-900">
            {transactions.length} transactions
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-slate-700">
            {importBatchCount} batches
          </Badge>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} compact />
        ))}
      </section>

      <Card className="rounded-[28px] border-slate-200/70 bg-slate-950 text-white shadow-none">
        <CardHeader>
          <CardTitle>This week’s signal board</CardTitle>
          <CardDescription className="text-slate-300">The quickest mobile read of what changed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InsightRow label="Top category" value={`${metrics.topCategory.name} • ${formatCurrency(metrics.topCategory.amount)}`} />
          <InsightRow label="Biggest merchant" value={`${metrics.biggestMerchant.name} • ${formatCurrency(metrics.biggestMerchant.amount)}`} />
          <InsightRow
            label="Card cycle"
            value={`${formatCurrency(metrics.currentBillingCycle.amountDue)} • ${metrics.currentBillingCycle.window.activeRangeLabel}`}
          />
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
        <CardHeader>
          <CardTitle>Weekly spend curve</CardTitle>
          <CardDescription>Tap a bar to open the matching ledger slice.</CardDescription>
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
          <CardDescription>Tap a bar to filter by outgoing category.</CardDescription>
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
          <CardDescription>Month-to-date spend against prior months.</CardDescription>
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

      <TopMerchantsCard merchants={merchants} compact />
    </div>
  );
}

function KpiCard({ kpi, compact = false }: { kpi: DashboardKpi; compact?: boolean }) {
  const Icon = kpi.icon;
  const cardContent = (
    <Card
      className={cn(
        "rounded-[24px] border-slate-200/70 bg-white/90 shadow-none transition",
        kpi.preset && "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]",
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

  if (!kpi.preset) {
    return cardContent;
  }

  return (
    <Link href={`/transactions?preset=${kpi.preset}`} className="block">
      {cardContent}
    </Link>
  );
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
  compact = false,
}: {
  merchants: { merchant: string; total: number }[];
  compact?: boolean;
}) {
  return (
    <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
      <CardHeader>
        <CardTitle>Top merchants</CardTitle>
        <CardDescription>Current month-to-date included outflows.</CardDescription>
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
