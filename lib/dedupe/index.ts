import { differenceInCalendarDays, parseISO } from "date-fns";

import { buildFingerprint } from "@/lib/finance";
import type { Transaction } from "@/types/finance";

export function getFingerprint(transaction: {
  sourceType: string;
  date: string;
  description: string;
  signedAmount: number;
}) {
  return buildFingerprint(transaction.sourceType, transaction.date, transaction.description, transaction.signedAmount);
}

export function findNearDuplicate(candidate: Transaction, existing: Transaction[]) {
  return existing.find((row) => {
    if (row.sourceType !== candidate.sourceType) {
      return false;
    }

    if (Math.abs(row.signedAmount) !== Math.abs(candidate.signedAmount)) {
      return false;
    }

    const dayGap = Math.abs(differenceInCalendarDays(parseISO(row.date), parseISO(candidate.date)));

    if (dayGap > 2) {
      return false;
    }

    return descriptionSimilarity(row.normalizedDescription, candidate.normalizedDescription) >= 0.7;
  });
}

function descriptionSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(leftTokens.size, rightTokens.size, 1);

  return overlap / denominator;
}
