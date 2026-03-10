import * as XLSX from "xlsx";
import Papa from "papaparse";

import type { ParseResult } from "@/lib/parsers/types";
import type { SourceType } from "@/types/finance";

type DetectedMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  reference?: string;
};

export async function parseTabularFile(file: File, sourceType: SourceType): Promise<ParseResult> {
  const records = file.name.toLowerCase().endsWith(".csv") ? await parseCsv(file) : await parseWorkbook(file);
  const headers = Object.keys(records[0] ?? {});
  const mapping = autoDetectMapping(headers, sourceType);

  if (!mapping) {
    return {
      parserId: "tabular-auto-mapping",
      status: "failed",
      message: "Could not auto-detect required columns. Manual mapping UI is the next step to wire.",
      rows: [],
    };
  }

  const rows = records.map((record) => {
    const amountCell = mapping.amount ? String(record[mapping.amount] ?? "") : "";
    const signedAmount = mapping.amount ? parseSignedCell(amountCell) : undefined;
    const debit = mapping.debit ? parseNumericCell(record[mapping.debit]) : undefined;
    const credit = mapping.credit ? parseNumericCell(record[mapping.credit]) : undefined;

    return {
      date: normalizeDateCell(record[mapping.date]),
      description: String(record[mapping.description] ?? "").trim(),
      amount: mapping.amount ? Math.abs(signedAmount ?? 0) : debit || credit,
      signedAmount,
      debit,
      credit,
      confidenceScore: 0.93,
      reviewReason: undefined,
      referenceNumber: mapping.reference ? String(record[mapping.reference] ?? "") : undefined,
    };
  });

  return {
    parserId: "tabular-auto-mapping",
    status: "success",
    message: `Parsed ${rows.length} rows from ${file.name}.`,
    rows,
  };
}

async function parseCsv(file: File) {
  return new Promise<Record<string, unknown>[]>((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        resolve(results.data);
      },
      error(error) {
        reject(error);
      },
    });
  });
}

async function parseWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
  });
}

function autoDetectMapping(headers: string[], sourceType: SourceType): DetectedMapping | null {
  const normalized = headers.map((header) => ({
    original: header,
    normalized: header.toLowerCase().trim(),
  }));
  const findHeader = (...keywords: string[]) =>
    normalized.find((entry) => keywords.some((keyword) => entry.normalized.includes(keyword)))?.original;

  const common: DetectedMapping = {
    date: findHeader("transaction date", "date"),
    description: findHeader("transaction remarks", "details", "description", "narration"),
    amount: findHeader("amount (inr)", "amount"),
    reference: findHeader("reference number"),
  } as DetectedMapping;

  if (sourceType === "credit_card" && common.date && common.description && common.amount) {
    return common;
  }

  const savingsMapping = {
    date: common.date,
    description: common.description,
    debit: findHeader("withdrawal amount"),
    credit: findHeader("deposit amount"),
    reference: common.reference,
    amount: common.amount,
  };

  if (sourceType === "savings" && savingsMapping.date && savingsMapping.description && (savingsMapping.debit || savingsMapping.credit)) {
    return savingsMapping;
  }

  return null;
}

function parseSignedCell(value: string) {
  const match = value.match(/([\d,]+(?:\.\d+)?)\s*(Dr\.|Cr\.)?/i);

  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1].replace(/,/g, ""));

  if (!match[2]) {
    return amount;
  }

  return match[2].toLowerCase().startsWith("cr") ? amount : -amount;
}

function parseNumericCell(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  const stringValue = String(value ?? "").replace(/,/g, "").trim();

  if (!stringValue) {
    return undefined;
  }

  return Number.parseFloat(stringValue);
}

function normalizeDateCell(value: unknown) {
  return String(value ?? "")
    .replace(/\./g, "-")
    .trim();
}
