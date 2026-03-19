"use client";

import { format } from "date-fns";

import { findNearDuplicate, getFingerprint } from "@/lib/dedupe";
import {
  buildRawHash,
  normalizeDescription,
  toMonthLabel,
  toMonthStart,
  toWeekLabel,
  toWeekStart,
} from "@/lib/finance";
import { parseIciciCreditCardPdf } from "@/lib/parsers/pdf/icici-credit-card-current";
import { parseIciciSavingsPdf } from "@/lib/parsers/pdf/icici-savings-transaction-history";
import { parseAutoDetectedTabularFile, parseTabularFile } from "@/lib/parsers/tabular";
import { db, deleteLatestImportBatch, getSettingValue, replaceDemoDataWithEmptyWorkspace, setSettingValue } from "@/lib/storage/db";
import { categorizeTransaction } from "@/lib/rules/categorize";
import type { ParseResult } from "@/lib/parsers/types";
import type {
  CategorizationRule,
  ImportBatch,
  RawImportedRow,
  SourceType,
  StatementFileType,
  StoredStatementFile,
  Transaction,
} from "@/types/finance";

type ImportResult = {
  batch: ImportBatch;
  storedTransactions: number;
  duplicatesSkipped: number;
  reviewCount: number;
  message: string;
  sourceType: SourceType;
};

export async function importStatementFile(file: File, sourceType?: SourceType): Promise<ImportResult> {
  const fileType = detectFileType(file.name);

  if (!fileType) {
    throw new Error("Unsupported file type. Use PDF, CSV, XLSX, or Excel files.");
  }

  if ((await getSettingValue<boolean>("demoMode")) !== false) {
    await replaceDemoDataWithEmptyWorkspace();
  }

  const resolvedImport = await resolveImportSource(file, fileType, sourceType);
  const resolvedSourceType = resolvedImport.sourceType;
  const parserResult = resolvedImport.parserResult;
  const batchId = `batch-${resolvedSourceType}-${Date.now()}`;
  const uploadedAt = new Date().toISOString();

  if (parserResult.status === "failed") {
    const failedBatch: ImportBatch = {
      id: batchId,
      uploadedAt,
      sourceType: resolvedSourceType,
      fileName: file.name,
      fileType,
      fileSizeBytes: file.size,
      statementPeriodStart: parserResult.statementPeriodStart,
      statementPeriodEnd: parserResult.statementPeriodEnd,
      totalRawRows: 0,
      rowsImported: 0,
      duplicatesSkipped: 0,
      rowsFlaggedForReview: 0,
      excludedRows: 0,
      parseErrors: 1,
      parserId: parserResult.parserId,
      status: "failed",
      errorReason: parserResult.message,
    };

    await db.importBatches.put(failedBatch);
    await db.storedStatementFiles.put(
      buildStoredStatementFile({
        batchId,
        uploadedAt,
        sourceType: resolvedSourceType,
        file,
        fileType,
        statementPeriodStart: parserResult.statementPeriodStart,
        statementPeriodEnd: parserResult.statementPeriodEnd,
      }),
    );

    return {
      batch: failedBatch,
      storedTransactions: 0,
      duplicatesSkipped: 0,
      reviewCount: 0,
      message: parserResult.message ?? "Import failed.",
      sourceType: resolvedSourceType,
    };
  }

  const rules = await db.rules.toArray();
  const existingTransactions = await db.transactions.toArray();
  const existingByFingerprint = new Map(existingTransactions.map((transaction) => [transaction.transactionFingerprint, transaction]));
  const toStore: Transaction[] = [];
  const rawRows: RawImportedRow[] = [];
  let duplicatesSkipped = 0;
  let excludedRows = 0;
  let reviewCount = 0;
  let parseErrors = 0;

  for (const [index, row] of parserResult.rows.entries()) {
    const normalized = normalizeRow({
      batchId,
      row,
      sourceType: resolvedSourceType,
      fileType,
      rules,
      index,
      statementPeriodStart: parserResult.statementPeriodStart,
      statementPeriodEnd: parserResult.statementPeriodEnd,
    });

    if (!normalized) {
      parseErrors += 1;
      rawRows.push({
        id: `${batchId}-raw-${index}`,
        batchId,
        rowIndex: index,
        sourceType: resolvedSourceType,
        rawText: row.description ?? "",
        rawHash: buildRawHash(batchId, index, row.description ?? ""),
        parserId: parserResult.parserId,
        confidenceScore: row.confidenceScore,
        reviewReason: row.reviewReason ?? "Missing required date, amount, or description.",
        needsReview: true,
      });
      reviewCount += 1;
      continue;
    }

    const existingMatch = existingByFingerprint.get(normalized.transactionFingerprint) ?? toStore.find(
      (candidate) => candidate.transactionFingerprint === normalized.transactionFingerprint,
    );

    if (existingMatch) {
      duplicatesSkipped += 1;
      rawRows.push({
        id: `${batchId}-raw-${index}`,
        batchId,
        rowIndex: index,
        sourceType: resolvedSourceType,
        rawText: row.description ?? "",
        rawHash: buildRawHash(batchId, index, row.description ?? ""),
        parserId: parserResult.parserId,
        confidenceScore: row.confidenceScore,
        reviewReason: "Duplicate fingerprint skipped during overlap detection.",
        needsReview: false,
        canonicalTransactionId: existingMatch.id,
        draftDescription: normalized.description,
        draftAmount: normalized.signedAmount,
        draftDate: normalized.date,
      });
      continue;
    }

    const nearDuplicate = findNearDuplicate(normalized, [...existingTransactions, ...toStore]);

    if (nearDuplicate && !normalized.needsReview) {
      normalized.needsReview = true;
      normalized.status = "pending_review";
      normalized.confidenceScore = Math.min(normalized.confidenceScore, 0.72);
      reviewCount += 1;
    }

    if (normalized.excludedFromSpend) {
      excludedRows += 1;
    }

    rawRows.push({
      id: `${batchId}-raw-${index}`,
      batchId,
      rowIndex: index,
      sourceType: resolvedSourceType,
      rawText: row.description ?? "",
      rawHash: normalized.rawRowHash,
      parserId: parserResult.parserId,
      confidenceScore: normalized.confidenceScore,
      reviewReason:
        normalized.needsReview && nearDuplicate
          ? "Near-duplicate detected against an existing canonical transaction."
          : row.reviewReason,
      needsReview: normalized.needsReview,
      canonicalTransactionId: normalized.id,
      draftDescription: normalized.description,
      draftAmount: normalized.signedAmount,
      draftDate: normalized.date,
    });

    toStore.push(normalized);
  }

  const batch: ImportBatch = {
    id: batchId,
    uploadedAt,
    sourceType: resolvedSourceType,
    fileName: file.name,
    fileType,
    fileSizeBytes: file.size,
    statementPeriodStart: parserResult.statementPeriodStart,
    statementPeriodEnd: parserResult.statementPeriodEnd,
    totalRawRows: parserResult.rows.length,
    rowsImported: toStore.length,
    duplicatesSkipped,
    rowsFlaggedForReview: reviewCount,
    excludedRows,
    parseErrors,
    parserId: parserResult.parserId,
    status: reviewCount > 0 || parserResult.status === "needs_review" ? "partial_review" : "imported",
    errorReason: parserResult.message,
  };

  await db.importBatches.put(batch);
  await db.storedStatementFiles.put(
    buildStoredStatementFile({
      batchId,
      uploadedAt,
      sourceType: resolvedSourceType,
      file,
      fileType,
      statementPeriodStart: parserResult.statementPeriodStart,
      statementPeriodEnd: parserResult.statementPeriodEnd,
    }),
  );
  if (rawRows.length > 0) {
    await db.rawImportedRows.bulkPut(rawRows);
  }
  if (toStore.length > 0) {
    await db.transactions.bulkPut(toStore);
  }
  await setSettingValue("demoMode", false);

  return {
    batch,
    storedTransactions: toStore.length,
    duplicatesSkipped,
    reviewCount,
    message: parserResult.message ?? `Imported ${toStore.length} net-new rows from ${file.name}.`,
    sourceType: resolvedSourceType,
  };
}

export async function removeLatestImportBatch(sourceType?: SourceType) {
  return deleteLatestImportBatch(sourceType);
}

function normalizeRow({
  batchId,
  row,
  sourceType,
  fileType,
  rules,
  index,
  statementPeriodStart,
  statementPeriodEnd,
}: {
  batchId: string;
  row: {
    date?: string;
    description?: string;
    amount?: number;
    signedAmount?: number;
    debit?: number;
    credit?: number;
    confidenceScore: number;
    reviewReason?: string;
  };
  sourceType: SourceType;
  fileType: StatementFileType;
  rules: CategorizationRule[];
  index: number;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
}) {
  const normalizedDate = toIsoDate(row.date ?? "");
  const description = row.description?.replace(/\s+/g, " ").trim() ?? "";
  const signedAmount =
    typeof row.signedAmount === "number"
      ? row.signedAmount
      : typeof row.debit === "number"
      ? -Math.abs(row.debit)
      : typeof row.credit === "number"
        ? Math.abs(row.credit)
        : inferSignedAmountFromSource(sourceType, row.amount ?? 0);

  if (!normalizedDate || !description || !signedAmount) {
    return null;
  }

  const categoryResult = categorizeTransaction(description, sourceType, rules);
  const normalizedDescription = normalizeDescription(description);
  const fingerprint = getFingerprint({
    sourceType,
    date: normalizedDate,
    description,
    signedAmount,
  });
  const needsReview = row.confidenceScore < 0.75 || categoryResult.category === "Uncategorized";
  const createdAt = new Date().toISOString();

  return {
    id: `${batchId}-txn-${index}`,
    importBatchId: batchId,
    sourceType,
    accountLabel: sourceType === "credit_card" ? "ICICI Credit Card" : "ICICI Savings",
    statementFileType: fileType,
    statementPeriodStart,
    statementPeriodEnd,
    date: normalizedDate,
    description,
    normalizedDescription,
    merchant: categoryResult.merchant,
    amount: Math.abs(signedAmount),
    signedAmount,
    direction: signedAmount < 0 ? "debit" : "credit",
    category: categoryResult.category,
    subcategory: undefined,
    excludedFromSpend: categoryResult.excludedFromSpend,
    exclusionReason: categoryResult.exclusionReason,
    weekLabel: toWeekLabel(normalizedDate),
    monthLabel: toMonthLabel(normalizedDate),
    rawRowHash: buildRawHash(batchId, index, description),
    transactionFingerprint: fingerprint,
    confidenceScore: row.confidenceScore,
    needsReview,
    createdAt,
    weekStart: toWeekStart(normalizedDate),
    monthStart: toMonthStart(normalizedDate),
    originBatchId: batchId,
    updatedAt: createdAt,
    status: needsReview ? "pending_review" : categoryResult.excludedFromSpend ? "excluded" : "active",
  } satisfies Transaction;
}

function detectFileType(fileName: string): StatementFileType | null {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";

  return null;
}

function inferSignedAmountFromSource(sourceType: SourceType, amount: number) {
  if (amount === 0) {
    return 0;
  }

  return sourceType === "credit_card" ? -Math.abs(amount) : amount;
}

function toIsoDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\./g, "-");

  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) {
    return trimmed;
  }

  return format(new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00`), "yyyy-MM-dd");
}

function buildStoredStatementFile({
  batchId,
  uploadedAt,
  sourceType,
  file,
  fileType,
  statementPeriodStart,
  statementPeriodEnd,
}: {
  batchId: string;
  uploadedAt: string;
  sourceType: SourceType;
  file: File;
  fileType: StatementFileType;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
}) {
  return {
    id: `${batchId}-file`,
    batchId,
    uploadedAt,
    sourceType,
    fileName: file.name,
    fileType,
    mimeType: file.type || getMimeTypeFromFileType(fileType),
    sizeBytes: file.size,
    lastModified: file.lastModified,
    statementPeriodStart,
    statementPeriodEnd,
    blob: file.slice(0, file.size, file.type || getMimeTypeFromFileType(fileType)),
  } satisfies StoredStatementFile;
}

function getMimeTypeFromFileType(fileType: StatementFileType) {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
}

async function resolveImportSource(
  file: File,
  fileType: StatementFileType,
  sourceType?: SourceType,
): Promise<{ sourceType: SourceType; parserResult: ParseResult }> {
  if (sourceType) {
    return {
      sourceType,
      parserResult:
        fileType === "pdf"
          ? sourceType === "credit_card"
            ? await parseIciciCreditCardPdf(file)
            : await parseIciciSavingsPdf(file)
          : await parseTabularFile(file, sourceType),
    };
  }

  if (fileType !== "pdf") {
    const autoDetected = await parseAutoDetectedTabularFile(file);

    if (!autoDetected.sourceType) {
      throw new Error(autoDetected.parserResult.message ?? "Could not auto-detect the statement type for this tabular file.");
    }

    return {
      sourceType: autoDetected.sourceType,
      parserResult: autoDetected.parserResult,
    };
  }

  const creditCardResult = await parseIciciCreditCardPdf(file);

  if (creditCardResult.status !== "failed") {
    return {
      sourceType: "credit_card",
      parserResult: creditCardResult,
    };
  }

  const savingsResult = await parseIciciSavingsPdf(file);

  if (savingsResult.status !== "failed") {
    return {
      sourceType: "savings",
      parserResult: savingsResult,
    };
  }

  throw new Error("Could not auto-detect whether this statement belongs to savings or credit-card imports.");
}
