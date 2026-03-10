import { extractUpiDetails } from "@/lib/finance";
import type { CategorizationRule, SourceType } from "@/types/finance";

type Categorization = {
  merchant: string;
  category: string;
  excludedFromSpend: boolean;
  exclusionReason?: string;
};

const merchantMatchers = [
  { regex: /zomato/i, merchant: "Zomato" },
  { regex: /swiggy/i, merchant: "Swiggy" },
  { regex: /uber/i, merchant: "Uber" },
  { regex: /ola/i, merchant: "Ola" },
  { regex: /blinkit/i, merchant: "Blinkit" },
  { regex: /amazon|amazon pay|bdskamazon/i, merchant: "Amazon" },
  { regex: /myntra/i, merchant: "Myntra" },
  { regex: /nykaa/i, merchant: "Nykaa" },
  { regex: /star wine/i, merchant: "Star Wine" },
  { regex: /openai|chatgpt/i, merchant: "OpenAI" },
  { regex: /probiller/i, merchant: "Probiller" },
  { regex: /indigo/i, merchant: "IndiGo" },
  { regex: /airbnb/i, merchant: "Airbnb" },
  { regex: /electricity/i, merchant: "Electricity" },
  { regex: /rent/i, merchant: "Rent" },
  { regex: /salary/i, merchant: "Salary Credit" },
  { regex: /atm/i, merchant: "ATM" },
];

export function categorizeTransaction(
  description: string,
  sourceType: SourceType,
  rules: CategorizationRule[],
): Categorization {
  const normalized = description.toLowerCase();

  if (/credit card payment|card payment|infinity payment received|thank you/i.test(description)) {
    return {
      merchant: inferMerchant(description, sourceType),
      category: "Transfer",
      excludedFromSpend: true,
      exclusionReason: "credit_card_payment",
    };
  }

  if (/salary|payment received|refund|tax refund/i.test(description)) {
    return {
      merchant: inferMerchant(description, sourceType),
      category: /refund/i.test(description) ? "Refund" : "Income",
      excludedFromSpend: true,
      exclusionReason: /refund/i.test(description) ? "refund" : "salary_credit",
    };
  }

  if (/atm|cash withdrawal/i.test(description)) {
    return {
      merchant: inferMerchant(description, sourceType),
      category: "Cash",
      excludedFromSpend: true,
      exclusionReason: "cash_withdrawal",
    };
  }

  if (/igst|markup fee|dcc fee|interest amount|principal amount amortization/i.test(description)) {
    return {
      merchant: inferMerchant(description, sourceType),
      category: "Finance Charges",
      excludedFromSpend: false,
    };
  }

  const matchedRule = rules
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .find((rule) => normalized.includes(rule.keyword.toLowerCase()));

  if (matchedRule) {
    return {
      merchant: inferMerchant(description, sourceType),
      category: matchedRule.category,
      excludedFromSpend: matchedRule.excludeFromSpend ?? false,
      exclusionReason: matchedRule.excludeFromSpend ? "rule_exclusion" : undefined,
    };
  }

  if (sourceType === "credit_card" && /airline|airbnb|uber|hotel/i.test(description)) {
    return { merchant: inferMerchant(description, sourceType), category: "Travel", excludedFromSpend: false };
  }

  return {
    merchant: inferMerchant(description, sourceType),
    category: "Uncategorized",
    excludedFromSpend: false,
  };
}

function inferMerchant(description: string, sourceType: SourceType) {
  const matched = merchantMatchers.find((entry) => entry.regex.test(description));

  if (matched) {
    return matched.merchant;
  }

  if (sourceType === "savings") {
    const upiDetails = extractUpiDetails(description);

    if (upiDetails?.party) {
      return upiDetails.party;
    }
  }

  return description
    .split(/[\/,]/)
    .map((segment) => segment.trim())
    .find((segment) => segment && !/\d/.test(segment) && !/^upi$/i.test(segment)) || description.slice(0, 40);
}
