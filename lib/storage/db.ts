"use client";

import Dexie, { type Table } from "dexie";

import {
  mockFileMappings,
  mockImportBatches,
  mockRawRows,
  mockRules,
  mockSettings,
  mockTransactionAnnotations,
  mockTransactions,
} from "@/lib/mock-data";
import type {
  CategorizationRule,
  FileMapping,
  ImportBatch,
  RawImportedRow,
  Setting,
  StoredStatementFile,
  Transaction,
  TransactionAnnotation,
  TransactionOverride,
} from "@/types/finance";

class MoneytrackerDatabase extends Dexie {
  importBatches!: Table<ImportBatch, string>;
  rawImportedRows!: Table<RawImportedRow, string>;
  transactions!: Table<Transaction, string>;
  rules!: Table<CategorizationRule, string>;
  overrides!: Table<TransactionOverride, string>;
  settings!: Table<Setting, string>;
  fileMappings!: Table<FileMapping, string>;
  storedStatementFiles!: Table<StoredStatementFile, string>;
  transactionAnnotations!: Table<TransactionAnnotation, string>;

  constructor() {
    super("moneytracker-db");

    this.version(1).stores({
      importBatches: "id, uploadedAt, sourceType, status",
      rawImportedRows: "id, batchId, sourceType, needsReview",
      transactions:
        "id, date, sourceType, category, excludedFromSpend, needsReview, statementFileType, weekStart, monthStart, status",
      rules: "id, keyword, priority",
      overrides: "id, transactionId, updatedAt",
      settings: "key",
      fileMappings: "id, sourceType, headerSignature",
    });

    this.version(2).stores({
      importBatches: "id, uploadedAt, sourceType, status",
      rawImportedRows: "id, batchId, sourceType, needsReview",
      transactions:
        "id, date, sourceType, category, excludedFromSpend, needsReview, statementFileType, weekStart, monthStart, status",
      rules: "id, keyword, priority",
      overrides: "id, transactionId, updatedAt",
      settings: "key",
      fileMappings: "id, sourceType, headerSignature",
      storedStatementFiles: "id, batchId, uploadedAt, sourceType, fileType",
    });

    this.version(3).stores({
      importBatches: "id, uploadedAt, sourceType, status",
      rawImportedRows: "id, batchId, sourceType, needsReview",
      transactions:
        "id, date, sourceType, category, excludedFromSpend, needsReview, statementFileType, weekStart, monthStart, status",
      rules: "id, keyword, priority",
      overrides: "id, transactionId, updatedAt",
      settings: "key",
      fileMappings: "id, sourceType, headerSignature",
      storedStatementFiles: "id, batchId, uploadedAt, sourceType, fileType",
      transactionAnnotations: "transactionFingerprint, updatedAt, *tags",
    });
  }
}

export const db = new MoneytrackerDatabase();

export async function ensureSeedData() {
  const seeded = await db.settings.get("seeded");

  if (seeded) {
    return;
  }

  await db.importBatches.bulkPut(mockImportBatches);
  await db.rawImportedRows.bulkPut(mockRawRows);
  await db.transactions.bulkPut(mockTransactions);
  await db.rules.bulkPut(mockRules);
  await db.settings.bulkPut(mockSettings);
  await db.fileMappings.bulkPut(mockFileMappings);
  await db.transactionAnnotations.bulkPut(mockTransactionAnnotations);
}

export async function replaceDemoDataWithEmptyWorkspace() {
  await db.importBatches.clear();
  await db.rawImportedRows.clear();
  await db.transactions.clear();
  await db.storedStatementFiles.clear();
  await db.transactionAnnotations.clear();
  await db.settings.put({ key: "demoMode", value: false });
  await db.settings.put({ key: "seeded", value: true });
}

export async function resetAllLocalData() {
  await db.importBatches.clear();
  await db.rawImportedRows.clear();
  await db.transactions.clear();
  await db.rules.clear();
  await db.overrides.clear();
  await db.settings.clear();
  await db.fileMappings.clear();
  await db.storedStatementFiles.clear();
  await db.transactionAnnotations.clear();
}

export async function getSettingValue<T extends string | boolean | number>(key: string) {
  return (await db.settings.get(key))?.value as T | undefined;
}

export async function setSettingValue(key: string, value: string | boolean | number) {
  await db.settings.put({ key, value });
}

export function normalizeTransactionAnnotationTags(tags: string[]) {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];

  for (const tag of tags) {
    const normalizedTag = tag.replace(/\s+/g, " ").trim();

    if (!normalizedTag) {
      continue;
    }

    const tagKey = normalizedTag.toLowerCase();

    if (seen.has(tagKey)) {
      continue;
    }

    seen.add(tagKey);
    normalizedTags.push(normalizedTag);
  }

  return normalizedTags;
}

export async function saveTransactionAnnotation({
  transactionFingerprint,
  note,
  tags,
}: Pick<TransactionAnnotation, "transactionFingerprint" | "note" | "tags">) {
  const normalizedNote = note.trim();
  const normalizedTags = normalizeTransactionAnnotationTags(tags);

  if (!normalizedNote && normalizedTags.length === 0) {
    await db.transactionAnnotations.delete(transactionFingerprint);
    return null;
  }

  const existingAnnotation = await db.transactionAnnotations.get(transactionFingerprint);
  const timestamp = new Date().toISOString();
  const annotation = {
    transactionFingerprint,
    note: normalizedNote,
    tags: normalizedTags,
    createdAt: existingAnnotation?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies TransactionAnnotation;

  await db.transactionAnnotations.put(annotation);

  return annotation;
}

export async function deleteLatestImportBatch(sourceType?: "savings" | "credit_card") {
  const batches = await db.importBatches.orderBy("uploadedAt").reverse().toArray();
  const batch = batches.find((entry) => (sourceType ? entry.sourceType === sourceType : true));

  if (!batch) {
    return null;
  }

  await db.rawImportedRows.where("batchId").equals(batch.id).delete();

  const createdTransactions = (await db.transactions.toArray()).filter(
    (transaction) => transaction.originBatchId === batch.id,
  );
  await Promise.all(createdTransactions.map((transaction) => db.transactions.delete(transaction.id)));
  await db.storedStatementFiles.where("batchId").equals(batch.id).delete();

  await db.importBatches.delete(batch.id);

  return batch;
}
