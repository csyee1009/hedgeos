import { ParsedRiskIntentDraft, TypedRiskIntent } from "../types";

export type StoredIntent = ParsedRiskIntentDraft | TypedRiskIntent;

export interface IntentRepository {
  readonly storageType?: string;
  save(intent: StoredIntent): Promise<StoredIntent>;
  findById(intentId: string): Promise<StoredIntent | null>;
  update(intent: StoredIntent): Promise<StoredIntent>;
}

/**
 * IN_MEMORY_DEVELOPMENT INTENT REPOSITORY
 * Non-durable development repository for HedgeOS intent management.
 * Data is stored in memory and will reset upon server restart.
 */
export class DevelopmentIntentRepository implements IntentRepository {
  private readonly store = new Map<string, StoredIntent>();
  public readonly storageType = "IN_MEMORY_DEVELOPMENT" as const;

  public async save(intent: StoredIntent): Promise<StoredIntent> {
    this.store.set(intent.intentId, { ...intent });
    return { ...intent };
  }

  public async findById(intentId: string): Promise<StoredIntent | null> {
    const existing = this.store.get(intentId);
    if (!existing) return null;
    return { ...existing };
  }

  public async update(intent: StoredIntent): Promise<StoredIntent> {
    this.store.set(intent.intentId, { ...intent });
    return { ...intent };
  }
}
