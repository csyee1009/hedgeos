import {
  CandidateStrategy,
  ProposedIntentAlternative,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import {
  compareRatios,
  ratioLessThanOrEqualPercent,
  tokenAmountLessThanOrEqual,
} from "./ExactFinancialMath";
import { sha256Digest } from "../utils/canonicalDigest";

export class FeasibilityAlternativeService {
  /**
   * Deterministically derives the smallest evidenced relaxation
   * in each supported dimension.
   *
   * IMPORTANT:
   * - Alternatives are proposals only.
   * - They never silently modify the confirmed intent.
   * - Only candidates with exact payoff evidence and verified
   *   buyer-spend evidence are eligible.
   */
  public static derive(
    intent: TypedRiskIntent,
    candidates: CandidateStrategy[]
  ): ProposedIntentAlternative[] {
    const evidenced =
      candidates.filter(
        (candidate) =>
          candidate.preview
            ?.previewStatus ===
          "PREVIEW_AVAILABLE" &&
          candidate.preview
            .buyerSpendStatus ===
          "VERIFIED" &&
          candidate.payoffSummary &&
          "exact" in
          candidate.payoffSummary &&
          Boolean(
            candidate.payoffSummary
              .exact
          )
      );

    const alternatives:
      ProposedIntentAlternative[] = [];

    /*
     * Exact target test.
     *
     * Never use rounded display downside percentages as
     * authoritative financial evidence.
     */
    const targetMet = (
      candidate: CandidateStrategy
    ): boolean => {
      const exact =
        this.getExactPayoff(
          candidate
        );

      if (!exact) {
        return false;
      }

      return ratioLessThanOrEqualPercent(
        BigInt(
          exact.maxLossValuePrice8
        ),
        BigInt(
          exact.exposureValuePrice8
        ),
        intent.targetMaxLossPercent
          .value
      );
    };

    const withinBudget = (
      candidate: CandidateStrategy
    ): boolean => {
      if (
        !candidate.preview ||
        candidate.preview
          .buyerSpendStatus !==
        "VERIFIED"
      ) {
        return false;
      }

      return tokenAmountLessThanOrEqual(
        candidate.preview
          .totalExpectedCost,
        intent.maxPremiumUSDC.value
      );
    };

    /* ============================================================
     * ALTERNATIVE 1:
     * Relax budget only.
     *
     * Keep target downside + horizon unchanged.
     * Select minimum observed verified buyer spend that satisfies
     * the protection target.
     * ============================================================ */

    const budgetCandidate =
      evidenced
        .filter(
          (candidate) =>
            targetMet(candidate) &&
            !withinBudget(candidate) &&
            this.reachesConfirmedHorizon(
              candidate,
              intent
            )
        )
        .sort((a, b) => {
          const cost =
            this.compareTokenAmounts(
              a.preview!
                .totalExpectedCost,
              b.preview!
                .totalExpectedCost
            );

          if (cost !== 0) {
            return cost;
          }

          const downside =
            this.compareCandidateDownside(
              a,
              b
            );

          if (downside !== 0) {
            return downside;
          }

          return a.strategyId.localeCompare(
            b.strategyId
          );
        })[0];

    if (budgetCandidate) {
      const proposedAmount =
        budgetCandidate.preview!
          .totalExpectedCost;

      const currentAmount =
        intent.maxPremiumUSDC.value;

      const proposed6 =
        this.scaleAmount(
          proposedAmount,
          6
        );

      const current6 =
        this.scaleAmount(
          currentAmount,
          6
        );

      const delta6 =
        proposed6 - current6;

      alternatives.push(
        this.make(
          intent,
          budgetCandidate,
          "MAX_PREMIUM_USDC",
          current6.toString(),
          proposed6.toString(),
          delta6.toString(),
          "Minimum observed verified buyer spend among candidates that satisfy the confirmed modeled-at-expiry downside target and horizon. Accepting this would create a new intent version; HedgeOS will not silently increase the confirmed budget."
        )
      );
    }

    /* ============================================================
     * ALTERNATIVE 2:
     * Relax downside target only.
     *
     * Keep confirmed budget + horizon unchanged.
     * Select strongest modeled protection available within budget.
     * ============================================================ */

    const downsideCandidate =
      evidenced
        .filter(
          (candidate) =>
            withinBudget(candidate) &&
            !targetMet(candidate) &&
            this.reachesConfirmedHorizon(
              candidate,
              intent
            )
        )
        .sort((a, b) => {
          const downside =
            this.compareCandidateDownside(
              a,
              b
            );

          if (downside !== 0) {
            return downside;
          }

          const cost =
            this.compareTokenAmounts(
              a.preview!
                .totalExpectedCost,
              b.preview!
                .totalExpectedCost
            );

          if (cost !== 0) {
            return cost;
          }

          return a.strategyId.localeCompare(
            b.strategyId
          );
        })[0];

    if (downsideCandidate) {
      const exact =
        this.getExactPayoff(
          downsideCandidate
        );

      if (exact) {
        /*
         * Convert the exact rational downside into a displayable
         * percent using CEILING, not truncation.
         *
         * This prevents an alternative from proposing a target
         * slightly smaller than the candidate actually satisfies.
         */
        const proposedPercent =
          this.ratioToCeilingPercentString(
            BigInt(
              exact.maxLossValuePrice8
            ),
            BigInt(
              exact.exposureValuePrice8
            ),
            6
          );

        const currentPercent =
          this.normalizePercentString(
            intent.targetMaxLossPercent
              .value
          );

        const deltaPercent =
          this.subtractDecimalStrings(
            proposedPercent,
            currentPercent,
            6
          );

        alternatives.push(
          this.make(
            intent,
            downsideCandidate,
            "TARGET_MAX_LOSS_PERCENT",
            currentPercent,
            proposedPercent,
            deltaPercent,
            "Strongest observed modeled-at-expiry protection within the confirmed budget and horizon. The proposed percentage is derived from exact payoff evidence and rounded upward only for safe display. Accepting it would create a new intent version."
          )
        );
      }
    }

    /* ============================================================
     * ALTERNATIVE 3:
     * Relax horizon only.
     *
     * Keep confirmed budget + downside target unchanged.
     * Select the closest earlier observed expiry.
     * ============================================================ */

    const horizonCandidate =
      evidenced
        .filter(
          (candidate) => {
            const expiry =
              this.getCandidateExpiry(
                candidate
              );

            return (
              expiry > 0 &&
              expiry <
              intent.horizonTimestamp
                .value.timestampMs &&
              withinBudget(candidate) &&
              targetMet(candidate)
            );
          }
        )
        .sort((a, b) => {
          const expiryA =
            this.getCandidateExpiry(
              a
            );

          const expiryB =
            this.getCandidateExpiry(
              b
            );

          /*
           * Later earlier-expiry is closer to the user's requested
           * horizon.
           */
          if (
            expiryA !== expiryB
          ) {
            return expiryB - expiryA;
          }

          const cost =
            this.compareTokenAmounts(
              a.preview!
                .totalExpectedCost,
              b.preview!
                .totalExpectedCost
            );

          if (cost !== 0) {
            return cost;
          }

          const downside =
            this.compareCandidateDownside(
              a,
              b
            );

          if (downside !== 0) {
            return downside;
          }

          return a.strategyId.localeCompare(
            b.strategyId
          );
        })[0];

    if (horizonCandidate) {
      const proposedTimestamp =
        this.getCandidateExpiry(
          horizonCandidate
        );

      const currentTimestamp =
        intent.horizonTimestamp
          .value.timestampMs;

      alternatives.push(
        this.make(
          intent,
          horizonCandidate,
          "HORIZON",
          String(currentTimestamp),
          String(proposedTimestamp),
          String(
            proposedTimestamp -
            currentTimestamp
          ),
          "Closest observed earlier option expiry that satisfies the confirmed budget and modeled-at-expiry downside target. Accepting it would create a new intent version; HedgeOS will not silently shorten the confirmed protection horizon."
        )
      );
    }

    /*
     * Canonical deterministic ordering.
     *
     * The UI will always receive alternatives in the same dimension
     * order for equivalent evidence.
     */
    const dimensionOrder:
      Record<
        ProposedIntentAlternative["dimension"],
        number
      > = {
      MAX_PREMIUM_USDC: 0,
      TARGET_MAX_LOSS_PERCENT: 1,
      HORIZON: 2,
    };

    alternatives.sort(
      (a, b) => {
        const dimensionDifference =
          dimensionOrder[a.dimension] -
          dimensionOrder[b.dimension];

        if (
          dimensionDifference !== 0
        ) {
          return dimensionDifference;
        }

        return a.alternativeId.localeCompare(
          b.alternativeId
        );
      }
    );

    return alternatives;
  }

  private static getExactPayoff(
    candidate: CandidateStrategy
  ):
    | {
      maxLossValuePrice8: string;
      exposureValuePrice8: string;
      totalCostUSDC6?: string;
      quantity18?: string;
      strikePrice8?: string;
      spotPrice8?: string;
    }
    | null {
    const payoff =
      candidate.payoffSummary;

    if (
      !payoff ||
      !("exact" in payoff) ||
      !payoff.exact
    ) {
      return null;
    }

    return payoff.exact;
  }

  private static compareCandidateDownside(
    a: CandidateStrategy,
    b: CandidateStrategy
  ): number {
    const exactA =
      this.getExactPayoff(a);

    const exactB =
      this.getExactPayoff(b);

    if (!exactA && !exactB) {
      return a.strategyId.localeCompare(
        b.strategyId
      );
    }

    if (!exactA) {
      return 1;
    }

    if (!exactB) {
      return -1;
    }

    return compareRatios(
      BigInt(
        exactA.maxLossValuePrice8
      ),
      BigInt(
        exactA.exposureValuePrice8
      ),
      BigInt(
        exactB.maxLossValuePrice8
      ),
      BigInt(
        exactB.exposureValuePrice8
      )
    );
  }

  private static reachesConfirmedHorizon(
    candidate: CandidateStrategy,
    intent: TypedRiskIntent
  ): boolean {
    const expiry =
      this.getCandidateExpiry(
        candidate
      );

    return (
      expiry >=
      intent.horizonTimestamp.value
        .timestampMs
    );
  }

  private static getCandidateExpiry(
    candidate: CandidateStrategy
  ): number {
    const expiries =
      candidate.quotes
        .map(
          (quote) =>
            quote.expiryTimestampMs
        )
        .filter(
          (value) =>
            Number.isFinite(value) &&
            value > 0
        );

    if (expiries.length === 0) {
      return 0;
    }

    /*
     * For a single-leg LONG_PUT this is simply the quote expiry.
     * For any future multi-leg evidence, use the earliest leg
     * because protection cannot be claimed beyond the first expiry.
     */
    return Math.min(...expiries);
  }

  private static compareTokenAmounts(
    a: TokenAmount,
    b: TokenAmount
  ): number {
    const scale =
      Math.max(
        a.decimals,
        b.decimals
      );

    const amountA =
      BigInt(
        a.amountBaseUnits
      ) *
      10n **
      BigInt(
        scale - a.decimals
      );

    const amountB =
      BigInt(
        b.amountBaseUnits
      ) *
      10n **
      BigInt(
        scale - b.decimals
      );

    if (amountA < amountB) {
      return -1;
    }

    if (amountA > amountB) {
      return 1;
    }

    return 0;
  }

  private static scaleAmount(
    amount: TokenAmount,
    targetDecimals: number
  ): bigint {
    const value =
      BigInt(
        amount.amountBaseUnits
      );

    if (
      amount.decimals ===
      targetDecimals
    ) {
      return value;
    }

    if (
      amount.decimals <
      targetDecimals
    ) {
      return (
        value *
        10n **
        BigInt(
          targetDecimals -
          amount.decimals
        )
      );
    }

    const divisor =
      10n **
      BigInt(
        amount.decimals -
        targetDecimals
      );

    /*
     * Amounts such as buyer-spend limits should never be silently
     * rounded downward when reducing precision.
     */
    return (
      value +
      divisor -
      1n
    ) / divisor;
  }

  /**
   * Returns a percentage string rounded UP to the requested number
   * of decimal places.
   *
   * Example:
   * numerator / denominator = 0.081234...
   * => 8.123400% etc.
   */
  private static ratioToCeilingPercentString(
    numerator: bigint,
    denominator: bigint,
    decimalPlaces: number
  ): string {
    if (
      numerator < 0n ||
      denominator <= 0n
    ) {
      throw new Error(
        "Invalid exact downside ratio"
      );
    }

    const decimalScale =
      10n **
      BigInt(decimalPlaces);

    /*
     * ratio * 100 * decimalScale
     */
    const scaledNumerator =
      numerator *
      100n *
      decimalScale;

    const scaledPercent =
      (scaledNumerator +
        denominator -
        1n) /
      denominator;

    const whole =
      scaledPercent /
      decimalScale;

    const fraction =
      (
        scaledPercent %
        decimalScale
      )
        .toString()
        .padStart(
          decimalPlaces,
          "0"
        )
        .replace(/0+$/, "");

    return fraction
      ? `${whole.toString()}.${fraction}`
      : whole.toString();
  }

  private static normalizePercentString(
    value: number
  ): string {
    if (
      !Number.isFinite(value)
    ) {
      throw new Error(
        "Invalid percentage"
      );
    }

    return String(value);
  }

  private static subtractDecimalStrings(
    left: string,
    right: string,
    decimals: number
  ): string {
    const parse = (
      value: string
    ): bigint => {
      const trimmed =
        value.trim();

      const negative =
        trimmed.startsWith("-");

      const unsigned =
        negative
          ? trimmed.slice(1)
          : trimmed;

      const [
        wholeRaw,
        fractionRaw = "",
      ] =
        unsigned.split(".");

      const whole =
        wholeRaw || "0";

      const fraction =
        fractionRaw
          .padEnd(
            decimals,
            "0"
          )
          .slice(
            0,
            decimals
          );

      const scaled =
        BigInt(
          `${whole}${fraction}`
        );

      return negative
        ? -scaled
        : scaled;
    };

    const difference =
      parse(left) -
      parse(right);

    const negative =
      difference < 0n;

    const absolute =
      negative
        ? -difference
        : difference;

    const scale =
      10n **
      BigInt(decimals);

    const whole =
      absolute / scale;

    const fraction =
      (
        absolute % scale
      )
        .toString()
        .padStart(
          decimals,
          "0"
        )
        .replace(/0+$/, "");

    const output =
      fraction
        ? `${whole.toString()}.${fraction}`
        : whole.toString();

    return negative
      ? `-${output}`
      : output;
  }

  private static make(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy,
    dimension:
      ProposedIntentAlternative["dimension"],
    currentValue: string,
    proposedValue: string,
    delta: string,
    explanation: string
  ): ProposedIntentAlternative {
    const quote =
      candidate.quotes[0];

    /*
     * CandidateStrategy does not currently carry discovery snapshot
     * fields directly. Never pretend quoteId itself is a snapshot ID.
     */
    const sourceSnapshotId =
      String(
        (candidate as any)
          .marketSnapshotId ??
        quote?.rawApiData
          ?.marketSnapshotId ??
        "UNKNOWN"
      );

    const sourceSnapshotDigest =
      (candidate as any)
        .marketSnapshotDigest ??
      quote?.rawApiData
        ?.marketSnapshotDigest;

    const sourceCandidateDigest =
      sha256Digest({
        strategyId:
          candidate.strategyId,

        strategyType:
          candidate.strategyType,

        quoteIds:
          candidate.quotes.map(
            (item) =>
              item.quoteId
          ),

        exactPayoff:
          this.getExactPayoff(
            candidate
          ),

        buyerSpend:
          candidate.preview
            ?.totalExpectedCost,

        buyerSpendStatus:
          candidate.preview
            ?.buyerSpendStatus,
      });

    const alternativeId =
      `alternative-${sha256Digest({
        intentId:
          intent.intentId,

        intentVersion:
          intent.version,

        strategyId:
          candidate.strategyId,

        dimension,

        currentValue,

        proposedValue,
      }).slice(0, 20)}`;

    const payload = {
      alternativeId,

      sourceCandidateId:
        candidate.strategyId,

      sourceCandidateDigest,

      sourceSnapshotId,

      sourceSnapshotDigest,

      sourceIntentId:
        intent.intentId,

      sourceIntentVersion:
        intent.version,

      status:
        "PROPOSED_ALTERNATIVE" as const,

      dimension,

      currentValue,

      proposedValue,

      delta,

      explanation,
    };

    return {
      ...payload,

      alternativeDigest:
        sha256Digest(payload),
    };
  }
}