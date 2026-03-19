"use client";

import Dexie, { type Table } from "dexie";

import {
  mockFileMappings,
  mockImportBatches,
  mockRawRows,
  mockRules,
  mockSettings,
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
}

export async function replaceDemoDataWithEmptyWorkspace() {
  await db.importBatches.clear();
  await db.rawImportedRows.clear();
  await db.transactions.clear();
  await db.storedStatementFiles.clear();
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
}

export async function getSettingValue<T extends string | boolean | number>(key: string) {
  return (await db.settings.get(key))?.value as T | undefined;
}

export async function setSettingValue(key: string, value: string | boolean | number) {
  await db.settings.put({ key, value });
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
