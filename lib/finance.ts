import { addMonths, endOfWeek, format, getDay, lastDayOfMonth, parseISO, startOfMonth, startOfWeek, subWeeks } from "date-fns";

import type { ImportBatch, RawImportedRow, Setting, Transaction } from "@/types/finance";

export type TransactionPreset =
  | "spend-this-week"
  | "spend-last-week"
  | "month-to-date"
  | "savings-spend"
  | "credit-card-spend"
  | "current-billing-cycle";

export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

export function formatCompactCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function normalizeDescription(description: string) {
  return description
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(upi|pos|igst|card|payment|txn|ref|verified|sent using)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toWeekLabel(date: string) {
  const weekStart = startOfWeek(parseISO(date), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(parseISO(date), { weekStartsOn: 1 });

  return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`;
}

export function toWeekStart(date: string) {
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function toMonthStart(date: string) {
  return format(startOfMonth(parseISO(date)), "yyyy-MM-dd");
}

export function toMonthLabel(date: string) {
  return format(parseISO(date), "MMM yyyy");
}

export function buildFingerprint(sourceType: string, date: string, description: string, signedAmount: number) {
  return `${sourceType}::${date}::${normalizeDescription(description)}::${signedAmount.toFixed(2)}`;
}

export function buildRawHash(batchId: string, index: number, description: string) {
  return `${batchId}-${index}-${normalizeDescription(description).slice(0, 48)}`;
}

export function getBillingCycleStartDay(settings: Setting[] | undefined, fallback = 25) {
  const value = settings?.find((setting) => setting.key === "billingCycleStartDay")?.value;
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampBillingCycleStartDay(parsed);
}

export function getBillingCycleWindow(cycleStartDay: number, today = new Date()) {
  const normalizedStartDay = clampBillingCycleStartDay(cycleStartDay);
  const thisMonthAnchor = getMonthAnchor(today, normalizedStartDay);
  const cycleStartDate = today >= thisMonthAnchor ? thisMonthAnchor : getMonthAnchor(addMonths(today, -1), normalizedStartDay);
  const nextCycleStartDate = getMonthAnchor(addMonths(cycleStartDate, 1), normalizedStartDay);

  return {
    cycleStartDay: normalizedStartDay,
    startDate: format(cycleStartDate, "yyyy-MM-dd"),
    throughDate: format(today, "yyyy-MM-dd"),
    nextCycleStartDate: format(nextCycleStartDate, "yyyy-MM-dd"),
    activeRangeLabel: `${format(cycleStartDate, "MMM d")} - ${format(today, "MMM d")}`,
    cutoffLabel: format(nextCycleStartDate, "MMM d"),
  };
}

export function getThisWeekComparisonWindow(today = new Date()) {
  const currentStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekdayIndex = getDay(today) === 0 ? 6 : getDay(today) - 1;
  const lastStart = subWeeks(currentStart, 1);

  return {
    currentStart,
    lastStart,
    weekdayIndex,
  };
}

export function getDashboardMetrics(transactions: Transaction[], billingCycleStartDay = 25) {
  const spendRows = transactions.filter(
    (transaction) =>
      !transaction.excludedFromSpend &&
      transaction.direction === "debit" &&
      transaction.status === "active",
  );
  const now = new Date();
  const { currentStart, lastStart, weekdayIndex } = getThisWeekComparisonWindow(now);
  const currentEnd = new Date(currentStart);
  currentEnd.setDate(currentStart.getDate() + weekdayIndex);
  const lastEnd = new Date(lastStart);
  lastEnd.setDate(lastStart.getDate() + weekdayIndex);
  const monthStart = startOfMonth(now);

  const currentWeekRows = spendRows.filter((row) => {
    const date = parseISO(row.date);
    return date >= currentStart && date <= currentEnd;
  });
  const lastWeekRows = spendRows.filter((row) => {
    const date = parseISO(row.date);
    return date >= lastStart && date <= lastEnd;
  });
  const mtdRows = spendRows.filter((row) => parseISO(row.date) >= monthStart);

  const currentWeek = sumSpend(currentWeekRows);
  const lastWeek = sumSpend(lastWeekRows);
  const savingsSpend = sumSpend(mtdRows.filter((row) => row.sourceType === "savings"));
  const creditCardSpend = sumSpend(mtdRows.filter((row) => row.sourceType === "credit_card"));
  const billingCycleWindow = getBillingCycleWindow(billingCycleStartDay, now);
  const currentBillingCycleRows = transactions.filter(
    (transaction) =>
      transaction.sourceType === "credit_card" &&
      transaction.date >= billingCycleWindow.startDate &&
      transaction.date <= billingCycleWindow.throughDate,
  );
  const currentBillingCycleDebitRows = currentBillingCycleRows.filter((transaction) => transaction.direction === "debit");
  const billingCycleGrossDebits = sumSpend(currentBillingCycleDebitRows);

  const topCategory = getTopGroup(mtdRows, "category");
  const biggestMerchant = getTopGroup(mtdRows, "merchant");
  const largestTransaction = currentWeekRows
    .slice()
    .sort((a, b) => Math.abs(b.signedAmount) - Math.abs(a.signedAmount))[0];

  return {
    currentWeek,
    lastWeek,
    wowChange: lastWeek === 0 ? 0 : ((currentWeek - lastWeek) / lastWeek) * 100,
    monthToDate: sumSpend(mtdRows),
    savingsSpend,
    creditCardSpend,
    currentBillingCycle: {
      amountDue: billingCycleGrossDebits,
      transactionCount: currentBillingCycleDebitRows.length,
      pendingReviewCount: currentBillingCycleRows.filter((transaction) => transaction.status === "pending_review").length,
      window: billingCycleWindow,
    },
    topCategory,
    biggestMerchant,
    largestTransaction,
  };
}

export function getPresetMeta(preset: TransactionPreset, billingCycleStartDay = 25) {
  switch (preset) {
    case "spend-this-week":
      return {
        label: "Spend this week",
        description: "Included outgoing transactions from the current week through today.",
      };
    case "spend-last-week":
      return {
        label: "Spend last week",
        description: "Included outgoing transactions from the prior week through the same weekday.",
      };
    case "month-to-date":
      return {
        label: "Month to date",
        description: "Included outgoing transactions from the start of this month through today.",
      };
    case "savings-spend":
      return {
        label: "Savings spend",
        description: "Included outgoing savings transactions from this month through today.",
      };
    case "credit-card-spend":
      return {
        label: "Credit card spend",
        description: "Included outgoing credit-card transactions from this month through today.",
      };
    case "current-billing-cycle":
      return {
        label: "Current billing cycle",
        description: `Outgoing credit-card transactions from cycle day ${clampBillingCycleStartDay(
          billingCycleStartDay,
        )} through today, including pending-review rows.`,
      };
  }
}

export function matchesTransactionPreset(
  transaction: Transaction,
  preset: TransactionPreset,
  today = new Date(),
  billingCycleStartDay = 25,
) {
  const transactionDate = parseISO(transaction.date);
  const { currentStart, lastStart, weekdayIndex } = getThisWeekComparisonWindow(today);
  const currentEnd = new Date(currentStart);
  currentEnd.setDate(currentStart.getDate() + weekdayIndex);
  const lastEnd = new Date(lastStart);
  lastEnd.setDate(lastStart.getDate() + weekdayIndex);
  const monthStart = startOfMonth(today);
  const billingCycleWindow = getBillingCycleWindow(billingCycleStartDay, today);
  const isIncludedSpend =
    !transaction.excludedFromSpend &&
    transaction.direction === "debit" &&
    transaction.status === "active";

  switch (preset) {
    case "spend-this-week":
      return isIncludedSpend && transactionDate >= currentStart && transactionDate <= currentEnd;
    case "spend-last-week":
      return isIncludedSpend && transactionDate >= lastStart && transactionDate <= lastEnd;
    case "month-to-date":
      return isIncludedSpend && transactionDate >= monthStart && transactionDate <= today;
    case "savings-spend":
      return (
        isIncludedSpend &&
        transaction.sourceType === "savings" &&
        transactionDate >= monthStart &&
        transactionDate <= today
      );
    case "credit-card-spend":
      return (
        isIncludedSpend &&
        transaction.sourceType === "credit_card" &&
        transactionDate >= monthStart &&
        transactionDate <= today
      );
    case "current-billing-cycle":
      return (
        transaction.sourceType === "credit_card" &&
        transaction.direction === "debit" &&
        transaction.date >= billingCycleWindow.startDate &&
        transaction.date <= billingCycleWindow.throughDate
      );
  }
}

export function buildWeeklySeries(transactions: Transaction[]) {
  const spendRows = transactions.filter(
    (row) => !row.excludedFromSpend && row.direction === "debit" && row.status === "active",
  );
  const grouped = new Map<string, { total: number; weekStart: string }>();

  for (const row of spendRows) {
    const current = grouped.get(row.weekLabel);

    if (current) {
      current.total += Math.abs(row.signedAmount);
      continue;
    }

    grouped.set(row.weekLabel, {
      total: Math.abs(row.signedAmount),
      weekStart: row.weekStart,
    });
  }

  return Array.from(grouped.entries()).map(([label, value]) => ({
    label,
    total: value.total,
    weekStart: value.weekStart,
  }));
}

export function buildCategorySeries(transactions: Transaction[]) {
  const grouped = new Map<string, number>();

  for (const row of transactions) {
    if (row.excludedFromSpend || row.direction !== "debit" || row.status !== "active") {
      continue;
    }
    grouped.set(row.category, (grouped.get(row.category) ?? 0) + Math.abs(row.signedAmount));
  }

  return Array.from(grouped.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

export function buildSourceSplit(transactions: Transaction[]) {
  const spendRows = transactions.filter(
    (row) => !row.excludedFromSpend && row.direction === "debit" && row.status === "active",
  );
  const savings = sumSpend(spendRows.filter((row) => row.sourceType === "savings"));
  const creditCard = sumSpend(spendRows.filter((row) => row.sourceType === "credit_card"));

  return [
    { name: "Savings", value: savings },
    { name: "Credit Card", value: creditCard },
  ];
}

export function buildMonthSeries(transactions: Transaction[]) {
  const grouped = new Map<string, number>();

  for (const row of transactions) {
    if (row.excludedFromSpend || row.direction !== "debit" || row.status !== "active") {
      continue;
    }
    grouped.set(row.monthLabel, (grouped.get(row.monthLabel) ?? 0) + Math.abs(row.signedAmount));
  }

  return Array.from(grouped.entries()).map(([label, total]) => ({ label, total }));
}

export function getTopMerchants(transactions: Transaction[]) {
  const grouped = new Map<string, number>();

  for (const row of transactions) {
    if (row.excludedFromSpend || row.direction !== "debit" || row.status !== "active") {
      continue;
    }
    grouped.set(row.merchant, (grouped.get(row.merchant) ?? 0) + Math.abs(row.signedAmount));
  }

  return Array.from(grouped.entries())
    .map(([merchant, total]) => ({ merchant, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

export function getReviewRows(rows: RawImportedRow[]) {
  return rows.filter((row) => row.needsReview);
}

export function getBatchHeadline(batch: ImportBatch) {
  return `${batch.rowsImported} imported • ${batch.duplicatesSkipped} duplicates • ${batch.rowsFlaggedForReview} review`;
}

function sumSpend(rows: Transaction[]) {
  return rows.reduce((total, row) => total + Math.abs(row.signedAmount), 0);
}

function clampBillingCycleStartDay(day: number) {
  return Math.min(Math.max(Math.trunc(day), 1), 31);
}

function getMonthAnchor(referenceDate: Date, day: number) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthLastDay = lastDayOfMonth(monthStart).getDate();

  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), Math.min(day, monthLastDay));
}

function getTopGroup(rows: Transaction[], key: "category" | "merchant") {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    grouped.set(row[key], (grouped.get(row[key]) ?? 0) + Math.abs(row.signedAmount));
  }

  const topEntry = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    name: topEntry?.[0] ?? "No data",
    amount: topEntry?.[1] ?? 0,
  };
}
