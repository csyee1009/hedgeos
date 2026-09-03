import { z } from "zod";

export const ProvenanceSourceSchema = z.enum([
  "USER_EXPLICIT",
  "AI_INFERRED",
  "SYSTEM_DEFAULT",
]);

export function createFieldProvenanceSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    source: ProvenanceSourceSchema,
    confidence: z.number().min(0).max(1),
    requiresConfirmation: z.boolean(),
    originalPhrase: z.string().optional(),
  });
}

export const TokenAmountSchema = z.object({
  amountBaseUnits: z.string(),
  decimals: z.number().int().nonnegative(),
  symbol: z.string(),
});

export const HorizonSchema = z.object({
  timestampMs: z.number().positive(),
  isoString: z.string(),
  formattedDisplay: z.string(),
  timezone: z.string(),
});

export const RiskObjectiveSchema = z.literal("DOWNSIDE_PROTECTION");

export const ParsedRiskIntentDraftSchema = z.object({
  intentId: z.string(),
  version: z.number().int().positive(),
  createdAtMs: z.number().positive(),
  updatedAtMs: z.number().positive(),
  confirmedAtMs: z.number().positive().optional(),
  confirmedByUser: z.literal(false),
  objective: createFieldProvenanceSchema(RiskObjectiveSchema),
  asset: createFieldProvenanceSchema(z.string()).nullable(),
  exposureAmount: createFieldProvenanceSchema(TokenAmountSchema).nullable(),
  targetMaxLossPercent: createFieldProvenanceSchema(z.number().min(0).max(100)).nullable(),
  maxPremiumUSDC: createFieldProvenanceSchema(TokenAmountSchema).nullable(),
  horizonTimestamp: createFieldProvenanceSchema(HorizonSchema).nullable(),
  allowedProtocols: createFieldProvenanceSchema(z.array(z.string())),
  allowMultiLeg: createFieldProvenanceSchema(z.boolean()),
  originalPromptText: z.string().optional(),
});

export const TypedRiskIntentSchema = z.object({
  intentId: z.string(),
  version: z.number().int().positive(),
  createdAtMs: z.number().positive(),
  updatedAtMs: z.number().positive(),
  confirmedAtMs: z.number().positive().optional(),
  confirmedByUser: z.boolean(),
  objective: createFieldProvenanceSchema(RiskObjectiveSchema),
  asset: createFieldProvenanceSchema(z.string()),
  exposureAmount: createFieldProvenanceSchema(TokenAmountSchema),
  targetMaxLossPercent: createFieldProvenanceSchema(z.number().min(0).max(100)),
  maxPremiumUSDC: createFieldProvenanceSchema(TokenAmountSchema),
  horizonTimestamp: createFieldProvenanceSchema(HorizonSchema),
  allowedProtocols: createFieldProvenanceSchema(z.array(z.string())),
  allowMultiLeg: createFieldProvenanceSchema(z.boolean()),
  originalPromptText: z.string().optional(),
});

export type ParsedRiskIntentDraftZod = z.infer<typeof ParsedRiskIntentDraftSchema>;
export type TypedRiskIntentZod = z.infer<typeof TypedRiskIntentSchema>;
