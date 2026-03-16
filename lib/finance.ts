import { addMonths, endOfWeek, format, getDay, lastDayOfMonth, parseISO, startOfMonth, startOfWeek, subWeeks } from "date-fns";

import type { ImportBatch, RawImportedRow, Setting, Transaction } from "@/types/finance";

const UPI_GENERIC_TOKENS = new Set([
  "upi",
  "p2a",
  "p2m",
  "cr",
  "dr",
  "pay",
  "paid",
  "payment",
  "payment received",
  "money transfer",
  "order payment",
  "sent using",
  "sent",
  "received",
  "credited",
  "debited",
  "collect",
  "collect request",
  "mandate",
  "txn",
  "txnid",
  "txn id",
  "ref",
  "reference",
  "salary credit",
]);

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

export function extractUpiDetails(description: string) {
  const compact = description.replace(/\s+/g, " ").trim();

  if (!/\bupi\b/i.test(compact)) {
    return null;
  }

  const rawTokens = compact
    .split(/[\/|]/)
    .map((token) => sanitizeUpiToken(token))
    .filter(Boolean);
  const tokens = rawTokens.length > 1 ? rawTokens : compact.split(/[-:]/).map((token) => sanitizeUpiToken(token)).filter(Boolean);
  const meaningfulTokens = tokens.filter(isMeaningfulUpiToken);

  if (meaningfulTokens.length === 0) {
    const handleMatch = compact.match(/([A-Za-z][A-Za-z0-9._-]{1,})@[A-Za-z]{2,}/);

    if (!handleMatch) {
      return null;
    }

    return { party: toDisplayCase(handleMatch[1]), context: undefined };
  }

  const party = meaningfulTokens[0];
  const context = meaningfulTokens.find((token, index) => index > 0 && !isGenericUpiContext(token));

  return {
    party: toDisplayCase(party),
    context: context ? toDisplayCase(context) : undefined,
  };
}

export function getTransactionMerchantLabel(transaction: Pick<Transaction, "description" | "merchant" | "sourceType">) {
  if (transaction.sourceType === "savings") {
    const upiDetails = extractUpiDetails(transaction.description);

    if (upiDetails?.party) {
      return upiDetails.party;
    }
  }

  return transaction.merchant;
}

export function getTransactionDescriptionLabel(transaction: Pick<Transaction, "description" | "direction" | "sourceType">) {
  if (transaction.sourceType !== "savings") {
    return transaction.description;
  }

  const upiDetails = extractUpiDetails(transaction.description);

  if (!upiDetails?.party) {
    return transaction.description;
  }

  const directionLabel = transaction.direction === "credit" ? "from" : "to";

  if (upiDetails.context) {
    return `UPI ${directionLabel} ${upiDetails.party} - ${upiDetails.context}`;
  }

  return `UPI ${directionLabel} ${upiDetails.party}`;
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

export function normalizeDateRange(fromDate?: string, toDate?: string) {
  const normalizedFrom = fromDate?.trim() ?? "";
  const normalizedTo = toDate?.trim() ?? "";

  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    return {
      fromDate: normalizedTo,
      toDate: normalizedFrom,
      isActive: true,
    };
  }

  return {
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    isActive: Boolean(normalizedFrom || normalizedTo),
  };
}

export function filterTransactionsByDateRange(transactions: Transaction[], fromDate?: string, toDate?: string) {
  const normalizedRange = normalizeDateRange(fromDate, toDate);

  if (!normalizedRange.isActive) {
    return transactions;
  }

  return transactions.filter((transaction) => {
    const matchesFromDate = !normalizedRange.fromDate || transaction.date >= normalizedRange.fromDate;
    const matchesToDate = !normalizedRange.toDate || transaction.date <= normalizedRange.toDate;

    return matchesFromDate && matchesToDate;
  });
}

export function formatDateRangeLabel(fromDate?: string, toDate?: string) {
  const normalizedRange = normalizeDateRange(fromDate, toDate);

  if (normalizedRange.fromDate && normalizedRange.toDate) {
    return `${format(parseISO(normalizedRange.fromDate), "MMM d")} - ${format(parseISO(normalizedRange.toDate), "MMM d")}`;
  }

  if (normalizedRange.fromDate) {
    return `From ${format(parseISO(normalizedRange.fromDate), "MMM d, yyyy")}`;
  }

  if (normalizedRange.toDate) {
    return `Through ${format(parseISO(normalizedRange.toDate), "MMM d, yyyy")}`;
  }

  return "All dates";
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

export function getDashboardDateRangeMetrics(transactions: Transaction[]) {
  const activeRows = transactions.filter((transaction) => transaction.status === "active");
  const spendRows = activeRows.filter((transaction) => !transaction.excludedFromSpend && transaction.direction === "debit");
  const creditRows = activeRows.filter((transaction) => transaction.direction === "credit");
  const totalCredits = creditRows.reduce((total, row) => total + Math.abs(row.signedAmount), 0);
  const netFlow = activeRows.reduce((total, row) => total + row.signedAmount, 0);

  return {
    totalSpend: sumSpend(spendRows),
    totalCredits,
    netFlow,
    savingsSpend: sumSpend(spendRows.filter((row) => row.sourceType === "savings")),
    creditCardSpend: sumSpend(spendRows.filter((row) => row.sourceType === "credit_card")),
    transactionCount: transactions.length,
    pendingReviewCount: transactions.filter((transaction) => transaction.status === "pending_review").length,
    topCategory: getTopGroup(spendRows, "category"),
    biggestMerchant: getTopGroup(spendRows, "merchant"),
    largestTransaction: spendRows.slice().sort((a, b) => Math.abs(b.signedAmount) - Math.abs(a.signedAmount))[0] ?? null,
    spendTransactionCount: spendRows.length,
    creditTransactionCount: creditRows.length,
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
    const merchantLabel = getTransactionMerchantLabel(row);

    grouped.set(merchantLabel, (grouped.get(merchantLabel) ?? 0) + Math.abs(row.signedAmount));
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
    const groupKey = key === "merchant" ? getTransactionMerchantLabel(row) : row[key];

    grouped.set(groupKey, (grouped.get(groupKey) ?? 0) + Math.abs(row.signedAmount));
  }

  const topEntry = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    name: topEntry?.[0] ?? "No data",
    amount: topEntry?.[1] ?? 0,
  };
}

function sanitizeUpiToken(token: string) {
  return token
    .trim()
    .replace(/([A-Za-z][A-Za-z0-9._-]{1,})@[A-Za-z]{2,}/g, "$1")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/\s+/g, " ");
}

function isMeaningfulUpiToken(token: string) {
  if (!token) {
    return false;
  }

  const normalized = token.toLowerCase();
  const compact = normalized.replace(/\s+/g, " ").trim();

  if (UPI_GENERIC_TOKENS.has(compact)) {
    return false;
  }

  if (!/[a-z]/i.test(token)) {
    return false;
  }

  if (/^\d+$/.test(token)) {
    return false;
  }

  if (compact.length < 3) {
    return false;
  }

  if (/^(?:txn|ref|utr|rrn|upi|id)[\s:-]*[a-z0-9-]+$/i.test(token)) {
    return false;
  }

  return true;
}

function isGenericUpiContext(token: string) {
  const normalized = token.toLowerCase().replace(/\s+/g, " ").trim();

  return UPI_GENERIC_TOKENS.has(normalized);
}

function toDisplayCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 4 && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
