export type SourceType = "savings" | "credit_card";
export type StatementFileType = "pdf" | "csv" | "xlsx";
export type Direction = "debit" | "credit";
export type TransactionStatus = "active" | "pending_review" | "excluded";

export type Transaction = {
  id: string;
  importBatchId: string;
  sourceType: SourceType;
  accountLabel: string;
  statementFileType: StatementFileType;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  date: string;
  description: string;
  normalizedDescription: string;
  merchant: string;
  amount: number;
  signedAmount: number;
  direction: Direction;
  category: string;
  subcategory?: string;
  excludedFromSpend: boolean;
  exclusionReason?: string;
  weekLabel: string;
  monthLabel: string;
  rawRowHash: string;
  transactionFingerprint: string;
  confidenceScore: number;
  needsReview: boolean;
  createdAt: string;
  weekStart: string;
  monthStart: string;
  originBatchId: string;
  updatedAt: string;
  status: TransactionStatus;
};

export type ImportBatch = {
  id: string;
  uploadedAt: string;
  sourceType: SourceType;
  fileName: string;
  fileType: StatementFileType;
  fileSizeBytes?: number;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  totalRawRows: number;
  rowsImported: number;
  duplicatesSkipped: number;
  rowsFlaggedForReview: number;
  excludedRows: number;
  parseErrors: number;
  parserId: string;
  status: "imported" | "partial_review" | "failed";
  errorReason?: string;
};

export type RawImportedRow = {
  id: string;
  batchId: string;
  rowIndex: number;
  sourceType: SourceType;
  rawText: string;
  rawHash: string;
  parserId: string;
  confidenceScore: number;
  reviewReason?: string;
  needsReview: boolean;
  canonicalTransactionId?: string;
  draftDescription?: string;
  draftAmount?: number;
  draftDate?: string;
};

export type CategorizationRule = {
  id: string;
  keyword: string;
  category: string;
  subcategory?: string;
  excludeFromSpend?: boolean;
  priority: number;
};

export type TransactionOverride = {
  id: string;
  transactionId: string;
  category?: string;
  excludedFromSpend?: boolean;
  merchant?: string;
  updatedAt: string;
};

export type Setting = {
  key: string;
  value: string | boolean | number;
};

export type FileMapping = {
  id: string;
  sourceType: SourceType;
  headerSignature: string;
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  transactionTypeColumn?: string;
};

export type UploadDraft = {
  id: string;
  sourceType: SourceType | "auto";
  fileName: string;
  fileType: StatementFileType | "unknown";
  fileSize: number;
  uploadedAt: string;
};

export type StoredStatementFile = {
  id: string;
  batchId: string;
  uploadedAt: string;
  sourceType: SourceType;
  fileName: string;
  fileType: StatementFileType;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  blob: Blob;
};
