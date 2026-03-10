"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownRight, ArrowUpRight, CalendarRange, CreditCard, Landmark, Sparkles, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/storage/db";
import {
  buildCategorySeries,
  buildMonthSeries,
  buildSourceSplit,
  buildWeeklySeries,
  formatCompactCurrency,
  formatCurrency,
  getDashboardMetrics,
  getBillingCycleStartDay,
  matchesTransactionPreset,
  getTopMerchants,
  type TransactionPreset,
} from "@/lib/finance";
import { cn } from "@/lib/utils";

const sourceColors = ["#0f172a", "#94a3b8"];

export function DashboardView() {
  const router = useRouter();
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const importBatches = useLiveQuery(() => db.importBatches.toArray(), []);
  const settings = useLiveQuery(() => db.settings.toArray(), []);

  if (!transactions || !settings) {
    return <p className="text-sm text-slate-500">Loading your local dashboard…</p>;
  }

  const billingCycleStartDay = getBillingCycleStartDay(settings);
  const metrics = getDashboardMetrics(transactions, billingCycleStartDay);
  const weeklySeries = buildWeeklySeries(transactions);
  const categorySeries = buildCategorySeries(transactions);
  const sourceSplit = buildSourceSplit(transactions);
  const monthSeries = buildMonthSeries(transactions);
  const merchants = getTopMerchants(transactions);

  function goToTransactions(params: Record<string, string>) {
    const query = new URLSearchParams(params);
    router.push(`/transactions?${query.toString()}`);
  }

  const kpis = [
    {
      label: "Spend this week",
      value: formatCurrency(metrics.currentWeek),
      icon: ArrowDownRight,
      tone: "text-rose-500",
      preset: "spend-this-week" as TransactionPreset,
    },
    {
      label: "Spend last week",
      value: formatCurrency(metrics.lastWeek),
      icon: ArrowUpRight,
      tone: "text-slate-600",
      preset: "spend-last-week" as TransactionPreset,
    },
    {
      label: "Week-on-week",
      value: `${metrics.wowChange.toFixed(1)}%`,
      icon: TrendingUp,
      tone: metrics.wowChange > 0 ? "text-rose-500" : "text-emerald-600",
    },
    {
      label: "Month to date",
      value: formatCurrency(metrics.monthToDate),
      icon: Sparkles,
      tone: "text-slate-900",
      preset: "month-to-date" as TransactionPreset,
    },
    {
      label: "Savings spend",
      value: formatCurrency(metrics.savingsSpend),
      icon: Landmark,
      tone: "text-indigo-600",
      preset: "savings-spend" as TransactionPreset,
    },
    {
      label: "Credit card spend",
      value: formatCurrency(metrics.creditCardSpend),
      icon: CreditCard,
      tone: "text-orange-500",
      preset: "credit-card-spend" as TransactionPreset,
    },
    {
      label: "Current card cycle",
      value: formatCurrency(metrics.currentBillingCycle.amountDue),
      icon: CalendarRange,
      tone: "text-cyan-700",
      preset: "current-billing-cycle" as TransactionPreset,
      detail: `${metrics.currentBillingCycle.window.activeRangeLabel} • next cutoff ${metrics.currentBillingCycle.window.cutoffLabel}`,
    },
  ];

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
            {importBatches?.length ?? 0} import batches
          </Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const matchingCount = kpi.preset
            ? transactions.filter((transaction) => matchesTransactionPreset(transaction, kpi.preset, new Date(), billingCycleStartDay)).length
            : null;
          const cardContent = (
            <Card
              key={kpi.label}
              className={cn(
                "rounded-[24px] border-slate-200/70 bg-white/90 shadow-none transition",
                kpi.preset && "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]",
              )}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div>
                  <CardDescription>{kpi.label}</CardDescription>
                  <CardTitle className="mt-2 text-2xl tracking-tight">{kpi.value}</CardTitle>
                  {kpi.detail ? <p className="mt-2 text-xs font-medium text-slate-500">{kpi.detail}</p> : null}
                  {matchingCount !== null ? (
                    <p className="mt-2 text-xs font-medium text-slate-500">{matchingCount} matching transactions</p>
                  ) : null}
                </div>
                <div className="rounded-2xl bg-slate-100 p-2.5">
                  <Icon className={`size-4 ${kpi.tone}`} />
                </div>
              </CardHeader>
            </Card>
          );

          if (!kpi.preset) {
            return cardContent;
          }

          return (
            <Link key={kpi.label} href={`/transactions?preset=${kpi.preset}`} className="block">
              {cardContent}
            </Link>
          );
        })}
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
                <YAxis tickFormatter={(value) => formatCompactCurrency(value)} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip formatter={(value) => formatTooltipValue(value)} />
                <Bar
                  dataKey="total"
                  radius={[12, 12, 0, 0]}
                  fill="#0f172a"
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const weekStart = (entry as { weekStart?: string } | undefined)?.weekStart;

                    if (!weekStart) {
                      return;
                    }

                    goToTransactions({ weekStart, flow: "outgoing" });
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
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Source split</CardTitle>
            <CardDescription>Included spend only.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceSplit}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={96}
                  paddingAngle={4}
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const name = (entry as { name?: string } | undefined)?.name;

                    if (!name) {
                      return;
                    }

                    goToTransactions({
                      source: name === "Savings" ? "savings" : "credit_card",
                      flow: "outgoing",
                    });
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
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 12 }} width={110} />
                <Tooltip formatter={(value) => formatTooltipValue(value)} />
                <Bar
                  dataKey="value"
                  radius={[0, 12, 12, 0]}
                  fill="#334155"
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const name = (entry as { name?: string } | undefined)?.name;

                    if (!name) {
                      return;
                    }

                    goToTransactions({ category: name, flow: "outgoing" });
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
        <Card className="rounded-[28px] border-slate-200/70 bg-white/90 shadow-none">
          <CardHeader>
            <CardTitle>Top merchants</CardTitle>
            <CardDescription>Current month-to-date included outflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {merchants.map((merchant, index) => (
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
