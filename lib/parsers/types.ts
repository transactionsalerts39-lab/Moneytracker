import { z } from "zod";

export const parsedRowSchema = z.object({
  date: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  signedAmount: z.number().optional(),
  debit: z.number().optional(),
  credit: z.number().optional(),
  referenceNumber: z.string().optional(),
  accountLabel: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).default(0.5),
  reviewReason: z.string().optional(),
});

export const parseResultSchema = z.object({
  parserId: z.string(),
  status: z.enum(["success", "needs_review", "failed"]),
  message: z.string().optional(),
  statementPeriodStart: z.string().optional(),
  statementPeriodEnd: z.string().optional(),
  rows: z.array(parsedRowSchema),
});

export type ParsedRow = z.infer<typeof parsedRowSchema>;
export type ParseResult = z.infer<typeof parseResultSchema>;
