import { format, parse } from "date-fns";

import { extractPdfLines, firstTextInRange, textInRange } from "@/lib/parsers/pdf/extract-lines";
import type { ParseResult } from "@/lib/parsers/types";

const DATE_PATTERN = /^\d{2}\.\d{2}\.\d{4}$/;

export async function parseIciciSavingsPdf(file: File): Promise<ParseResult> {
  const pages = await extractPdfLines(file);
  const headerText = pages.flat().map((line) => line.text).join(" ");
  const statementPeriodMatch = headerText.match(/period\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+-\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const rows: ParseResult["rows"] = [];

  for (const pageLines of pages) {
    const anchors = pageLines.filter((line) => {
      const serial = firstTextInRange(line, 0, 50);
      const dateText = firstTextInRange(line, 50, 110);

      return /^\d+$/.test(serial) && DATE_PATTERN.test(dateText);
    });

    for (const [index, line] of anchors.entries()) {
      const dateText = firstTextInRange(line, 50, 110);
      const nextAnchor = anchors[index + 1];
      const remarksParts = pageLines
        .filter((candidate) => {
          const inUpperWindow = candidate.y > line.y && candidate.y <= line.y + 8;
          const inLowerWindow = candidate.y < line.y && candidate.y >= line.y - 28;
          const belongsToNextRow =
            nextAnchor && candidate.y > nextAnchor.y && candidate.y <= nextAnchor.y + 8;

          return inUpperWindow || (inLowerWindow && !belongsToNextRow);
        })
        .map((candidate) => textInRange(candidate, 180, 395))
        .filter((value) => value && !/Transaction Remarks/i.test(value));

      const withdrawal = firstTextInRange(line, 395, 465);
      const deposit = firstTextInRange(line, 465, 530);
      const description = remarksParts.join(" ").replace(/\s+/g, " ").trim();
      const debit = parseNumber(withdrawal);
      const credit = parseNumber(deposit);

      rows.push({
        date: format(parse(dateText, "dd.MM.yyyy", new Date()), "yyyy-MM-dd"),
        description,
        debit: debit || undefined,
        credit: credit || undefined,
        amount: debit || credit || undefined,
        confidenceScore: remarksParts.length > 2 ? 0.83 : 0.94,
        reviewReason: remarksParts.length > 2 ? "Multiline savings narration extracted across PDF lines." : undefined,
      });
    }
  }

  if (rows.length === 0) {
    return {
      parserId: "icici-savings-transaction-history",
      status: "failed",
      message: "The PDF text did not contain recognizable ICICI savings transaction rows.",
      rows,
    };
  }

  return {
    parserId: "icici-savings-transaction-history",
    status: rows.some((row) => row.confidenceScore < 0.9) ? "needs_review" : "success",
    message: `Parsed ${rows.length} savings rows from text-based PDF.`,
    statementPeriodStart: statementPeriodMatch ? toIsoDate(statementPeriodMatch[1], "MMMM d, yyyy") : undefined,
    statementPeriodEnd: statementPeriodMatch ? toIsoDate(statementPeriodMatch[2], "MMMM d, yyyy") : undefined,
    rows,
  };
}

function parseNumber(value: string) {
  const clean = value.replace(/,/g, "").trim();

  if (!clean) {
    return 0;
  }

  return Number.parseFloat(clean);
}

function toIsoDate(value: string, pattern: string) {
  return format(parse(value, pattern, new Date()), "yyyy-MM-dd");
}
