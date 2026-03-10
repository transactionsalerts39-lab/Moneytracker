import { format, parse } from "date-fns";

import { extractPdfLines, firstTextInRange, textInRange } from "@/lib/parsers/pdf/extract-lines";
import type { ParseResult } from "@/lib/parsers/types";

const DATE_PATTERN = /^\d{2}-\d{2}-\d{4}$/;

export async function parseIciciCreditCardPdf(file: File): Promise<ParseResult> {
  const pages = await extractPdfLines(file);
  const headerText = pages.flat().map((line) => line.text).join(" ");
  const statementPeriodMatch = headerText.match(/(\d{2}-\d{2}-\d{4})\s+TO\s+(\d{2}-\d{2}-\d{4})/i);
  const rows: ParseResult["rows"] = [];

  for (const pageLines of pages) {
    for (let index = 0; index < pageLines.length; index += 1) {
      const line = pageLines[index];
      const dateText = firstTextInRange(line, 0, 120);
      const amountText = firstTextInRange(line, 330, 500);
      const referenceNumber = firstTextInRange(line, 500, 620);

      if (!DATE_PATTERN.test(dateText) || !amountText || !referenceNumber) {
        continue;
      }

      const descriptionParts = [textInRange(line, 180, 330)].filter(Boolean);
      let lookahead = index + 1;

      while (lookahead < pageLines.length) {
        const nextLine = pageLines[lookahead];
        const nextDate = firstTextInRange(nextLine, 0, 120);

        if (DATE_PATTERN.test(nextDate)) {
          break;
        }

        const continuation = textInRange(nextLine, 180, 330);

        if (!continuation) {
          break;
        }

        descriptionParts.push(continuation);
        lookahead += 1;
      }

      const amount = parseCreditCardAmount(amountText);
      const description = descriptionParts.join(" ").replace(/\s+/g, " ").trim();

      rows.push({
        date: format(parse(dateText, "dd-MM-yyyy", new Date()), "yyyy-MM-dd"),
        description,
        amount: Math.abs(amount),
        signedAmount: amount,
        confidenceScore: descriptionParts.length > 2 ? 0.85 : 0.96,
        reviewReason: descriptionParts.length > 2 ? "Multi-line merchant description extracted from PDF." : undefined,
        referenceNumber,
      });

      index = lookahead - 1;
    }
  }

  if (rows.length === 0) {
    return {
      parserId: "icici-credit-card-current",
      status: "failed",
      message: "The PDF text did not contain recognizable ICICI credit-card transaction rows.",
      rows,
    };
  }

  return {
    parserId: "icici-credit-card-current",
    status: rows.some((row) => row.confidenceScore < 0.9) ? "needs_review" : "success",
    message: `Parsed ${rows.length} credit-card rows from text-based PDF.`,
    statementPeriodStart: statementPeriodMatch ? toIsoDate(statementPeriodMatch[1], "dd-MM-yyyy") : undefined,
    statementPeriodEnd: statementPeriodMatch ? toIsoDate(statementPeriodMatch[2], "dd-MM-yyyy") : undefined,
    rows,
  };
}

function parseCreditCardAmount(amountText: string) {
  const match = amountText.match(/([\d,]+(?:\.\d+)?)\s*(Dr\.|Cr\.)/i);

  if (!match) {
    return 0;
  }

  const value = Number.parseFloat(match[1].replace(/,/g, ""));

  return match[2].toLowerCase().startsWith("cr") ? value : -value;
}

function toIsoDate(value: string, pattern: string) {
  return format(parse(value, pattern, new Date()), "yyyy-MM-dd");
}
