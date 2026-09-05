import { createHash } from "crypto";

export function canonicalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
