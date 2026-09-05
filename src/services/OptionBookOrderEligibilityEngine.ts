import { OrderEligibilityEvidence } from "../types";

export interface VanillaPutImplementation {
  address: string;
  name: string;
  type: string;
  numStrikes: number;
}

export interface OptionBookEligibilityResult {
  eligible: boolean;
  evidence: OrderEligibilityEvidence;
}

/**
 * Fail-closed eligibility gate over the original Thetanuts
 * OrderWithSignature.
 *
 * Important SDK compatibility:
 * - rawApiData.isLong === true means maker sells / taker buys.
 * - the normalized SDK order may expose optionType instead of isCall.
 * - installed SDK semantics use optionType = 1 for PUT.
 */
export class OptionBookOrderEligibilityEngine {
  private static isPutOptionType(value: unknown): boolean {
    if (value === 1 || value === 1n) {
      return true;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toUpperCase();

      return normalized === "1" || normalized === "PUT";
    }

    return false;
  }

  private static getRawPutEvidence(raw: any): boolean {
    if (!raw) {
      return false;
    }

    if (raw.isCall === false) {
      return true;
    }

    return this.isPutOptionType(raw.optionType);
  }

  private static getNormalizedPutEvidence(normalized: any): boolean {
    if (!normalized) {
      return false;
    }

    /*
     * Current SDK normalization uses optionType.
     * Keep the legacy isCall fallback only for compatibility with
     * older fixtures/persisted test objects.
     */
    if (this.isPutOptionType(normalized.optionType)) {
      return true;
    }

    return normalized.isCall === false;
  }

  private static normalizeAddress(value: unknown): string {
    return typeof value === "string"
      ? value.trim().toLowerCase()
      : "";
  }

  private static firstNormalizedStrike(normalized: any): string | null {
    try {
      if (
        normalized &&
        Array.isArray(normalized.strikes) &&
        normalized.strikes.length > 0
      ) {
        return String(normalized.strikes[0]);
      }

      if (
        normalized &&
        normalized.strike !== undefined &&
        normalized.strike !== null
      ) {
        return String(normalized.strike);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Evaluate whether an OptionBook order is safe to represent as the
   * currently supported HedgeOS strategy: taker BUYING one vanilla PUT.
   */
  public static evaluate(
    orderWithSignature: any,
    supportedImplementations: VanillaPutImplementation[],
    nowMs = Date.now()
  ): OptionBookEligibilityResult {
    const raw = orderWithSignature?.rawApiData;
    const normalized = orderWithSignature?.order;

    const checks: OrderEligibilityEvidence["checks"] = [];

    const check = (
      code: string,
      passed: boolean,
      details: string
    ): void => {
      checks.push({
        code,
        passed,
        details,
      });
    };

    const signature =
      typeof orderWithSignature?.signature === "string"
        ? orderWithSignature.signature.trim()
        : "";

    check(
      "ORDER_SHAPE",
      Boolean(raw && normalized && signature),
      "Original raw order, normalized SDK order, and maker signature must all be present."
    );

    /*
     * Direction
     *
     * The raw signed-order evidence is authoritative here.
     * rawApiData.isLong=true means the maker is selling the option,
     * therefore the HedgeOS taker is BUYING the option.
     */
    const takerBuysOption = raw?.isLong === true;

    check(
      "TAKER_BUYS_OPTION",
      takerBuysOption,
      takerBuysOption
        ? "rawApiData.isLong=true proves the maker sells and the HedgeOS taker buys the option."
        : "Order rejected because HedgeOS only supports the taker buying protection; rawApiData.isLong must be true."
    );

    /*
     * PUT semantics
     *
     * Do NOT require normalized.isCall because current SDK
     * normalization exposes optionType instead.
     */
    const rawIsPut = this.getRawPutEvidence(raw);
    const normalizedIsPut =
      this.getNormalizedPutEvidence(normalized);

    check(
      "RAW_PUT",
      rawIsPut,
      rawIsPut
        ? "Original protocol order identifies a PUT."
        : "Original protocol order does not prove PUT semantics."
    );

    check(
      "NORMALIZED_PUT",
      normalizedIsPut,
      normalizedIsPut
        ? "Normalized SDK order identifies optionType=PUT."
        : "Normalized SDK order does not prove optionType=PUT."
    );

    /*
     * Native multi-strike structures must not be silently flattened
     * into a LONG_PUT.
     */
    const strikes = Array.isArray(raw?.strikes)
      ? raw.strikes.map((strike: unknown) =>
        String(strike)
      )
      : [];

    check(
      "SINGLE_STRIKE",
      strikes.length === 1,
      `LONG_PUT requires exactly one protocol strike; observed ${strikes.length}.`
    );

    /*
     * Implementation must come from the SDK-configured allowlist.
     */
    const implementationAddress =
      this.normalizeAddress(
        raw?.implementation ??
        normalized?.implementation
      );

    const implementation =
      supportedImplementations.find(
        (item) =>
          this.normalizeAddress(item.address) ===
          implementationAddress
      );

    const implName = implementation?.name?.trim()?.toUpperCase() ?? "";
    const implementationEligible = Boolean(
      implementation &&
      (implName === "PUT" || implName === "PHYSICAL_PUT") &&
      implementation.type
        .trim()
        .toUpperCase() === "VANILLA" &&
      implementation.numStrikes === 1
    );

    check(
      "VANILLA_PUT_IMPLEMENTATION",
      implementationEligible,
      implementation
        ? `SDK chain configuration identifies ${implementation.name}/${implementation.type} with ${implementation.numStrikes} strike(s).`
        : "Implementation is absent from the SDK-configured single-strike vanilla PUT allowlist."
    );

    /*
     * Exact integer evidence.
     */
    const nowSeconds = BigInt(
      Math.floor(nowMs / 1000)
    );

    let orderDeadline = 0n;
    let expiry = 0n;
    let availableAmount = 0n;
    let numericEvidenceValid = true;

    try {
      orderDeadline = BigInt(
        raw?.orderExpiryTimestamp ??
        normalized?.orderExpiryTimestamp ??
        0
      );

      expiry = BigInt(
        normalized?.expiry ??
        raw?.expiry ??
        0
      );

      availableAmount = BigInt(
        orderWithSignature?.availableAmount ?? 0
      );
    } catch {
      numericEvidenceValid = false;
    }

    check(
      "VALID_NUMERIC_EVIDENCE",
      numericEvidenceValid,
      "Order deadline, option expiry, and maker capacity must parse as exact integers."
    );

    check(
      "ORDER_DEADLINE",
      numericEvidenceValid &&
      orderDeadline > nowSeconds,
      numericEvidenceValid &&
        orderDeadline > nowSeconds
        ? "Order signing/fill deadline is still valid."
        : "Order signing/fill deadline is absent, invalid, or expired."
    );

    check(
      "OPTION_EXPIRY",
      numericEvidenceValid &&
      expiry > nowSeconds,
      numericEvidenceValid &&
        expiry > nowSeconds
        ? "Option expiry is strictly in the future."
        : "Option expiry is absent, invalid, or expired."
    );

    /*
     * availableAmount is only evidence that maker capacity exists.
     * It is NOT directly interpreted as option contract quantity.
     * Exact capacity must later be derived through the SDK's
     * calculateMaxContracts path.
     */
    check(
      "MAKER_CAPACITY_PRESENT",
      numericEvidenceValid &&
      availableAmount > 0n,
      numericEvidenceValid &&
        availableAmount > 0n
        ? "SDK availableAmount shows positive maker collateral/capacity evidence."
        : "No positive maker collateral/capacity is currently available."
    );

    /*
     * Normalization consistency.
     *
     * Compare the fields that should survive SDK normalization.
     */
    const normalizedStrike =
      this.firstNormalizedStrike(normalized);

    const rawStrike =
      strikes.length === 1
        ? strikes[0]
        : null;

    const normalizedMaker =
      this.normalizeAddress(
        normalized?.maker
      );

    const outerMaker =
      this.normalizeAddress(
        orderWithSignature?.makerAddress
      );

    const strikeConsistent =
      rawStrike !== null &&
      normalizedStrike !== null &&
      rawStrike === normalizedStrike;

    const makerConsistent =
      normalizedMaker.length > 0 &&
      outerMaker.length > 0 &&
      normalizedMaker === outerMaker;

    check(
      "STRIKE_NORMALIZATION_CONSISTENT",
      strikeConsistent,
      strikeConsistent
        ? "Normalized strike matches the original signed-order strike."
        : "Normalized strike does not match the original signed-order evidence."
    );

    check(
      "MAKER_NORMALIZATION_CONSISTENT",
      makerConsistent,
      makerConsistent
        ? "Normalized maker matches OrderWithSignature.makerAddress."
        : "Normalized maker does not match OrderWithSignature.makerAddress."
    );

    /*
     * Where the normalized object exposes isLong, require it to
     * agree with raw evidence. Missing normalized isLong is not a
     * failure because the installed SDK may not expose that field.
     */
    const normalizedDirectionPresent =
      typeof normalized?.isLong === "boolean";

    const normalizedDirectionConsistent =
      !normalizedDirectionPresent ||
      normalized.isLong === raw?.isLong;

    check(
      "DIRECTION_NORMALIZATION_CONSISTENT",
      normalizedDirectionConsistent,
      normalizedDirectionPresent
        ? normalizedDirectionConsistent
          ? "Normalized direction agrees with raw signed-order evidence."
          : "Normalized direction conflicts with raw signed-order evidence."
        : "Normalized SDK object does not expose isLong; raw signed-order direction remains authoritative."
    );

    /*
     * The normalized option type must agree with the original PUT
     * evidence. This specifically prevents the old bug where valid
     * PUTs were rejected because normalized.isCall did not exist.
     */
    check(
      "OPTION_TYPE_NORMALIZATION_CONSISTENT",
      rawIsPut && normalizedIsPut,
      rawIsPut && normalizedIsPut
        ? "Raw and normalized protocol evidence consistently identify a PUT."
        : "Raw and normalized protocol evidence do not consistently identify a PUT."
    );

    const eligible = checks.every(
      (item) => item.passed
    );

    return {
      eligible,
      evidence: {
        status: eligible
          ? "ELIGIBLE_LONG_PUT"
          : "REJECTED",

        checkedAtMs: nowMs,

        checks,
      },
    };
  }
}