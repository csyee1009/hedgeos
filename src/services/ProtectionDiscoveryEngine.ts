import {
  DiscoveryCandidate,
  MarketSnapshotEvidence,
  ProtectionDiscoveryResult,
  ProtectionSituation,
  TokenAmount,
} from "../types";
import {
  calculateExactLongPutPayoff,
  compareRatios,
  ratioLessThanOrEqualPercent,
  scaleExact,
} from "./ExactFinancialMath";
import { OptionSizingAdapter } from "./OptionSizingAdapter";
import { ThetanutsMarketService } from "./ThetanutsMarketService";
import { sha256Digest } from "../utils/canonicalDigest";

const OPTIONBOOK_CONTRACT_SCALE = 1_000_000_000_000n;

export class ProtectionDiscoveryEngine {
  constructor(
    private marketService: ThetanutsMarketService =
      new ThetanutsMarketService()
  ) { }

  public async discover(
    situation: ProtectionSituation
  ): Promise<ProtectionDiscoveryResult> {
    if (
      !situation.asset ||
      !situation.exposureAmount ||
      !situation.horizonTimestamp
    ) {
      throw new Error(
        `Missing factual information: ${situation.missingFactualFields.join(", ")}`
      );
    }

    const snapshot =
      await this.marketService.fetchMarketSnapshot(
        situation.asset.value
      );

    return this.discoverFromSnapshot(
      situation,
      snapshot
    );
  }

  public async discoverFromSnapshot(
    situation: ProtectionSituation,
    snapshot: MarketSnapshotEvidence
  ): Promise<ProtectionDiscoveryResult> {
    const base = {
      discoveryId:
        `discovery-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,

      situation,

      marketSnapshot: snapshot,

      paretoFrontier:
        [] as DiscoveryCandidate[],

      excludedCandidateCount: 0,

      deterministicRule:
        "A candidate is removed only when another observed candidate costs no more, has no greater modeled-at-expiry downside, covers at least as much exposure, and is strictly better in at least one dimension.",
    };

    /*
     * Fail closed whenever fresh live market evidence cannot
     * currently be established.
     *
     * RATE_LIMITED must never be interpreted as an empty market.
     */
    if (
      snapshot.status === "NOT_CONFIGURED" ||
      snapshot.status === "CONNECTING" ||
      snapshot.status === "LIVE_READ_FAILED" ||
      snapshot.status === "STALE" ||
      snapshot.status === "RATE_LIMITED"
    ) {
      return this.finish({
        ...base,

        status:
          "LIVE_MARKET_UNAVAILABLE",

        explanation:
          snapshot.error ||
          `Live market evidence is unavailable (${snapshot.status}). No liquidity, pricing, or feasibility conclusion was inferred.`,
      });
    }

    /*
     * This is different from a failed read.
     * Only an actually successful empty-orderbook read may
     * produce VERIFIED_EMPTY_ORDERBOOK.
     */
    if (
      snapshot.status ===
      "VERIFIED_EMPTY_ORDERBOOK"
    ) {
      return this.finish({
        ...base,

        status:
          "VERIFIED_EMPTY_ORDERBOOK",

        explanation:
          "The live OptionBook read succeeded and returned no orders. HedgeOS does not infer unavailable liquidity from a failed read. An unsubmitted RFQ specification may be considered after the user chooses constraints.",
      });
    }

    /*
     * Discovery must only continue from an explicitly successful
     * live snapshot.
     */
    if (
      snapshot.status !==
      "LIVE_READ_AVAILABLE"
    ) {
      return this.finish({
        ...base,

        status:
          "LIVE_MARKET_UNAVAILABLE",

        explanation:
          `Market snapshot status '${snapshot.status}' is not sufficient for deterministic protection discovery.`,
      });
    }

    if (
      !snapshot.spotPrice ||
      !situation.asset ||
      !situation.exposureAmount ||
      !situation.horizonTimestamp
    ) {
      return this.finish({
        ...base,

        status:
          "PRECISE_INFEASIBILITY",

        explanation:
          "Required factual context or live spot-price evidence is incomplete.",
      });
    }

    const sizing =
      OptionSizingAdapter.resolveSizing(
        situation.exposureAmount.value,
        situation.asset.value
      );

    if (
      sizing.sizingStatus !==
      "RESOLVED" ||
      !sizing.resolvedOptionQuantity
    ) {
      return this.finish({
        ...base,

        status:
          "PRECISE_INFEASIBILITY",

        explanation:
          sizing.error ||
          "Exact one-for-one long-put sizing is unavailable.",
      });
    }

    let quantity18: bigint;

    try {
      quantity18 = scaleExact(
        BigInt(
          sizing.resolvedOptionQuantity
            .amountBaseUnits
        ),
        sizing.resolvedOptionQuantity
          .decimals,
        18
      );
    } catch {
      return this.finish({
        ...base,

        status:
          "PRECISE_INFEASIBILITY",

        explanation:
          "Resolved option quantity could not be represented using exact base-unit arithmetic.",
      });
    }

    if (
      quantity18 <= 0n ||
      quantity18 %
      OPTIONBOOK_CONTRACT_SCALE !==
      0n
    ) {
      return this.finish({
        ...base,

        status:
          "PRECISE_INFEASIBILITY",

        explanation:
          "Requested protection quantity cannot be represented exactly in Thetanuts OptionBook contract precision.",
      });
    }

    const candidates:
      DiscoveryCandidate[] = [];

    let excluded = 0;

    for (const quote of snapshot.quotes) {
      /*
       * Only the narrowly-supported safe structure enters
       * discovery:
       *
       * - PUT
       * - taker buys
       * - single-strike vanilla
       * - currently executable
       * - expiry reaches requested horizon
       */
      if (
        quote.optionRight !== "PUT" ||
        quote.expiryTimestampMs <
        situation.horizonTimestamp.value
          .timestampMs ||
        quote.executableNow !== true ||
        quote.eligibilityEvidence
          ?.status !==
        "ELIGIBLE_LONG_PUT"
      ) {
        excluded += 1;
        continue;
      }

      const maxContracts6 =
        this.marketService.calculateMaxContracts(
          quote
        );

      if (maxContracts6 <= 0n) {
        excluded += 1;
        continue;
      }

      const maxQuantity18 =
        maxContracts6 *
        OPTIONBOOK_CONTRACT_SCALE;

      if (
        quantity18 >
        maxQuantity18
      ) {
        excluded += 1;
        continue;
      }

      const preview =
        await this.marketService.previewFill(
          quote,
          quantity18
        );

      /*
       * Buyer-spend evidence must be VERIFIED.
       *
       * Fee breakdown itself may remain INCOMPLETE;
       * discovery does not pretend otherwise.
       */
      if (
        preview.previewStatus !==
        "PREVIEW_AVAILABLE" ||
        preview.buyerSpendStatus !==
        "VERIFIED"
      ) {
        excluded += 1;
        continue;
      }

      try {
        const strikePrice8 =
          scaleExact(
            BigInt(
              quote.strikePrice
                .amountBaseUnits
            ),
            quote.strikePrice.decimals,
            8
          );

        const spotPrice8 =
          scaleExact(
            BigInt(
              snapshot.spotPrice
                .amountBaseUnits
            ),
            snapshot.spotPrice.decimals,
            8
          );

        const totalCostUSDC6 =
          scaleExact(
            BigInt(
              preview.totalExpectedCost
                .amountBaseUnits
            ),
            preview.totalExpectedCost
              .decimals,
            6
          );

        if (
          strikePrice8 <= 0n ||
          spotPrice8 <= 0n ||
          totalCostUSDC6 < 0n
        ) {
          excluded += 1;
          continue;
        }

        const payoff =
          calculateExactLongPutPayoff({
            quantity18,
            strikePrice8,
            spotPrice8,
            totalCostUSDC6,
            assetSymbol:
              situation.asset.value,
            calculatedAtMs:
              snapshot.capturedAtMs,
          });

        const evidence =
          payoff.exact;

        if (!evidence) {
          excluded += 1;
          continue;
        }

        /*
         * Candidate digest commits to the exact market snapshot
         * and exact financially material evidence.
         *
         * Display percentages are deliberately excluded from the
         * authoritative digest.
         */
        const digestPayload = {
          snapshotId:
            snapshot.snapshotId,

          snapshotDigest:
            snapshot.snapshotDigest,

          quoteId:
            quote.quoteId,

          strategyType:
            "LONG_PUT",

          asset:
            situation.asset.value,

          quantity18:
            evidence.quantity18,

          spendUSDC6:
            evidence.totalCostUSDC6,

          maxLossValuePrice8:
            evidence.maxLossValuePrice8,

          exposureValuePrice8:
            evidence.exposureValuePrice8,

          strikePrice8:
            evidence.strikePrice8,

          spotPrice8:
            evidence.spotPrice8,

          expiryTimestampMs:
            quote.expiryTimestampMs,

          allStrikes:
            quote.allStrikes?.map(
              (strike) => ({
                amountBaseUnits:
                  strike.amountBaseUnits,
                decimals:
                  strike.decimals,
              })
            ),

          implementationAddress:
            quote.implementationAddress,

          makerAddress:
            quote.makerAddress,

          makerIsSeller:
            quote.makerIsSeller,

          normalizedOptionType:
            quote.normalizedOptionType,

          orderValidityDeadlineMs:
            quote.orderValidityDeadlineMs,
        };

        const candidateDigest =
          sha256Digest(
            digestPayload
          );

        candidates.push({
          candidateId:
            `candidate-${candidateDigest.slice(0, 16)}`,

          quoteId:
            quote.quoteId,

          strategyType:
            "LONG_PUT",

          asset:
            situation.asset.value,

          /*
           * Preserve original resolved sizing object so the
           * rest of the application remains backward-compatible.
           */
          quantity:
            sizing.resolvedOptionQuantity,

          coveredExposure:
            situation.exposureAmount.value,

          verifiedBuyerSpend:
            preview.totalExpectedCost,

          buyerSpendStatus:
            "VERIFIED",

          feeStatus:
            preview.feeStatus,

          modeledAtExpiryDownside: {
            /*
             * Display only.
             * Exact ratio below is authoritative.
             */
            displayPercent:
              payoff.effectiveDownsidePercent,

            maxLossValuePrice8:
              evidence.maxLossValuePrice8,

            exposureValuePrice8:
              evidence.exposureValuePrice8,
          },

          strike:
            quote.strikePrice,

          expiryTimestampMs:
            quote.expiryTimestampMs,

          maxFillableQuantity: {
            amountBaseUnits:
              maxQuantity18.toString(),
            decimals: 18,
            symbol: "CONTRACTS",
          },

          marketSnapshotId:
            snapshot.snapshotId,

          marketSnapshotDigest:
            snapshot.snapshotDigest,

          candidateDigest,

          labels: [],
        });
      } catch {
        excluded += 1;
      }
    }

    /*
     * Build deterministic Pareto frontier.
     */
    const frontier =
      candidates.filter(
        (candidate) =>
          !candidates.some(
            (other) =>
              other.candidateId !==
              candidate.candidateId &&
              this.dominates(
                other,
                candidate
              )
          )
      );

    /*
     * Canonical ordering:
     * 1. lower verified buyer spend
     * 2. stronger modeled protection
     * 3. deterministic candidate id
     */
    frontier.sort((a, b) => {
      const cost =
        this.compareTokenAmounts(
          a.verifiedBuyerSpend,
          b.verifiedBuyerSpend
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

      return a.candidateId.localeCompare(
        b.candidateId
      );
    });

    if (frontier.length > 0) {
      /*
       * Lower cost means exactly the minimum verified cost on the
       * frontier.
       */
      this.addLabel(
        frontier[0],
        "LOWER_COST"
      );

      /*
       * Stronger protection means exactly the minimum modeled
       * at-expiry downside ratio.
       *
       * Equal downside:
       * lower exact cost wins.
       *
       * Still equal:
       * candidate ID gives deterministic order.
       */
      const strongest =
        [...frontier].sort(
          (a, b) => {
            const downside =
              this.compareCandidateDownside(
                a,
                b
              );

            if (
              downside !== 0
            ) {
              return downside;
            }

            const cost =
              this.compareTokenAmounts(
                a.verifiedBuyerSpend,
                b.verifiedBuyerSpend
              );

            if (cost !== 0) {
              return cost;
            }

            return a.candidateId.localeCompare(
              b.candidateId
            );
          }
        )[0];

      if (strongest) {
        this.addLabel(
          strongest,
          "STRONGER_MODELED_PROTECTION"
        );
      }

      /*
       * This is deliberately NOT called "balanced" or
       * "recommended".
       *
       * It is mechanically the median verified-cost frontier
       * observation.
       */
      if (frontier.length >= 3) {
        const middleIndex =
          Math.floor(
            (frontier.length - 1) /
            2
          );

        this.addLabel(
          frontier[middleIndex],
          "MID_RANGE_TRADE_OFF"
        );
      }
    }

    return this.finish({
      ...base,

      status:
        frontier.length > 0
          ? "FEASIBLE_MARKET_TRADE_OFFS"
          : "PRECISE_INFEASIBILITY",

      paretoFrontier:
        frontier,

      excludedCandidateCount:
        excluded +
        (candidates.length -
          frontier.length),

      explanation:
        frontier.length > 0
          ? "HedgeOS found nondominated, fully sized long-put trade-offs from one verified market snapshot. LOWER_COST means minimum verified buyer spend on the frontier. STRONGER_MODELED_PROTECTION means minimum modeled-at-expiry downside. MID_RANGE_TRADE_OFF is only the median verified-cost frontier observation and is not an AI recommendation."
          : "Live orders were observed, but none simultaneously passed PUT direction, single-strike structure, requested horizon, exact sizing, maker capacity, and verified buyer-spend evidence.",
    });
  }

  /**
   * Boundary query:
   * Given a budget, choose the strongest observed modeled-at-expiry
   * protection without exceeding that budget.
   */
  public strongestWithinBudget(
    frontier: DiscoveryCandidate[],
    budget: TokenAmount
  ): DiscoveryCandidate | null {
    return (
      frontier
        .filter((candidate) =>
          this.compareTokenAmounts(
            candidate.verifiedBuyerSpend,
            budget
          ) <= 0
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
              a.verifiedBuyerSpend,
              b.verifiedBuyerSpend
            );

          if (cost !== 0) {
            return cost;
          }

          return a.candidateId.localeCompare(
            b.candidateId
          );
        })[0] || null
    );
  }

  /**
   * Boundary query:
   * Given a maximum modeled downside, return the minimum-cost
   * observed candidate satisfying it.
   */
  public lowestCostForDownside(
    frontier: DiscoveryCandidate[],
    targetPercent: string | number
  ): DiscoveryCandidate | null {
    return (
      frontier
        .filter((candidate) =>
          ratioLessThanOrEqualPercent(
            BigInt(
              candidate
                .modeledAtExpiryDownside
                .maxLossValuePrice8
            ),
            BigInt(
              candidate
                .modeledAtExpiryDownside
                .exposureValuePrice8
            ),
            targetPercent
          )
        )
        .sort((a, b) => {
          const cost =
            this.compareTokenAmounts(
              a.verifiedBuyerSpend,
              b.verifiedBuyerSpend
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

          return a.candidateId.localeCompare(
            b.candidateId
          );
        })[0] || null
    );
  }

  /**
   * Pareto dominance using normalized exact base units.
   */
  private dominates(
    a: DiscoveryCandidate,
    b: DiscoveryCandidate
  ): boolean {
    const costComparison =
      this.compareTokenAmounts(
        a.verifiedBuyerSpend,
        b.verifiedBuyerSpend
      );

    const downsideComparison =
      this.compareCandidateDownside(
        a,
        b
      );

    const coverageComparison =
      this.compareTokenAmounts(
        a.coveredExposure,
        b.coveredExposure
      );

    const noWorse =
      costComparison <= 0 &&
      downsideComparison <= 0 &&
      coverageComparison >= 0;

    const strictlyBetter =
      costComparison < 0 ||
      downsideComparison < 0 ||
      coverageComparison > 0;

    return (
      noWorse &&
      strictlyBetter
    );
  }

  private compareCandidateDownside(
    a: DiscoveryCandidate,
    b: DiscoveryCandidate
  ): number {
    return compareRatios(
      BigInt(
        a.modeledAtExpiryDownside
          .maxLossValuePrice8
      ),
      BigInt(
        a.modeledAtExpiryDownside
          .exposureValuePrice8
      ),
      BigInt(
        b.modeledAtExpiryDownside
          .maxLossValuePrice8
      ),
      BigInt(
        b.modeledAtExpiryDownside
          .exposureValuePrice8
      )
    );
  }

  /**
   * Exact comparison between token amounts even when their decimal
   * precision differs.
   */
  private compareTokenAmounts(
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

  private addLabel(
    candidate: DiscoveryCandidate,
    label:
      DiscoveryCandidate["labels"][number]
  ): void {
    if (
      !candidate.labels.includes(
        label
      )
    ) {
      candidate.labels.push(
        label
      );
    }
  }

  private finish(
    result: Omit<
      ProtectionDiscoveryResult,
      "discoveryDigest"
    >
  ): ProtectionDiscoveryResult {
    return {
      ...result,

      discoveryDigest:
        sha256Digest(result),
    };
  }
}