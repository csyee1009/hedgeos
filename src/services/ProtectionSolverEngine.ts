import {
  CandidateStrategy,
  MarketQuote,
  OptionLeg,
  PolicyDecisionRecord,
  ProtectionSolverPipelineResult,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { ActionProposalBuilder } from "./ActionProposalBuilder";
import { calculateExactLongPutPayoff, scaleExact } from "./ExactFinancialMath";
import { FinancialConstitutionEngine } from "./FinancialConstitutionEngine";
import { HumanReviewService } from "./HumanReviewService";
import { OptionSizingAdapter } from "./OptionSizingAdapter";
import { RFQRequirementEngine } from "./RFQRequirementEngine";
import { RFQSpecificationBuilder } from "./RFQSpecificationBuilder";
import { ThetanutsMarketService } from "./ThetanutsMarketService";
import { ThetanutsSimulationService } from "./ThetanutsSimulationService";

const scaleBaseUnits = (
  amount: bigint,
  fromDecimals: number,
  toDecimals: number
): bigint => {
  if (fromDecimals === toDecimals) {
    return amount;
  }

  if (fromDecimals < toDecimals) {
    return (
      amount *
      10n ** BigInt(toDecimals - fromDecimals)
    );
  }

  return (
    amount /
    10n ** BigInt(fromDecimals - toDecimals)
  );
};

export class ProtectionSolverEngine {
  private policyEngine: FinancialConstitutionEngine;
  private simulationService: ThetanutsSimulationService;

  constructor(
    private marketService: ThetanutsMarketService =
      new ThetanutsMarketService(),
    policyEngine?: FinancialConstitutionEngine
  ) {
    this.policyEngine =
      policyEngine ||
      new FinancialConstitutionEngine();

    this.simulationService =
      new ThetanutsSimulationService(
        this.marketService
      );
  }

  public async evaluateCandidates(
    intent: TypedRiskIntent,
    quotes: MarketQuote[]
  ): Promise<{
    rankedStrategies: CandidateStrategy[];
    rejectedCandidates: CandidateStrategy[];
  }> {
    const rawCandidates: CandidateStrategy[] = [];

    const unresolvedCandidates: CandidateStrategy[] =
      [];

    const rejectedCandidates: CandidateStrategy[] =
      [];

    const targetAsset =
      intent.asset.value.toUpperCase();

    let spotPriceUSD = 0;

    try {
      spotPriceUSD =
        await this.marketService.getSpotPrice(
          targetAsset
        );
    } catch {
      spotPriceUSD = 0;
    }

    const putQuotes = quotes.filter(
      (quote) => {
        const underlying =
          quote.asset.toUpperCase();

        const assetMatches =
          underlying === targetAsset ||
          (targetAsset === "ETH" &&
            underlying === "WETH") ||
          (targetAsset === "BTC" &&
            underlying === "CBBTC");

        return (
          assetMatches &&
          quote.optionRight === "PUT"
        );
      }
    );

    for (const quote of putQuotes) {
      const strikeUSD =
        Number(
          BigInt(
            quote.strikePrice
              .amountBaseUnits
          )
        ) /
        10 **
        quote.strikePrice.decimals;

      const sizingResult =
        OptionSizingAdapter.resolveSizing(
          intent.exposureAmount.value,
          targetAsset
        );

      const leg: OptionLeg = {
        side: "BUY",

        right: "PUT",

        strikePrice:
          quote.strikePrice,

        expiryTimestampMs:
          quote.expiryTimestampMs,

        requestedExposure:
          intent.exposureAmount.value,

        resolvedOptionQuantity:
          sizingResult.resolvedOptionQuantity,

        sizingStatus:
          sizingResult.sizingStatus,

        quoteReference:
          quote.quoteId,
      };

      let maxFillableContracts:
        | TokenAmount
        | undefined;

      let liquiditySufficient =
        false;

      if (
        quote.availableQuantity &&
        leg.resolvedOptionQuantity
      ) {
        const requestedQuantity =
          leg.resolvedOptionQuantity;

        const requestedBaseUnits =
          BigInt(
            requestedQuantity
              .amountBaseUnits
          );

        if (
          quote.availableQuantity
            .amountBaseUnits === "0"
        ) {
          liquiditySufficient = false;
        } else if (
          quote.availableQuantity
            .symbol === "CONTRACTS"
        ) {
          const normalizedAvailable =
            scaleBaseUnits(
              BigInt(
                quote.availableQuantity
                  .amountBaseUnits
              ),
              quote.availableQuantity
                .decimals,
              requestedQuantity.decimals
            );

          maxFillableContracts = {
            amountBaseUnits:
              normalizedAvailable.toString(),

            decimals:
              requestedQuantity.decimals,

            symbol: "CONTRACTS",
          };

          liquiditySufficient =
            requestedBaseUnits > 0n &&
            normalizedAvailable >=
            requestedBaseUnits;
        } else {
          const maxContracts6 =
            this.marketService.calculateMaxContracts(
              quote
            );

          const normalizedAvailable =
            scaleBaseUnits(
              maxContracts6,
              6,
              requestedQuantity.decimals
            );

          maxFillableContracts = {
            amountBaseUnits:
              normalizedAvailable.toString(),

            decimals:
              requestedQuantity.decimals,

            symbol: "CONTRACTS",
          };

          liquiditySufficient =
            requestedBaseUnits > 0n &&
            normalizedAvailable >=
            requestedBaseUnits;
        }
      }

      const preview =
        await this.marketService.previewFill(
          quote,
          BigInt(
            leg.resolvedOptionQuantity
              ?.amountBaseUnits ||
            intent.exposureAmount.value
              .amountBaseUnits
          )
        );

      let payoffSummary: any =
        undefined;

      if (
        sizingResult.sizingStatus !==
        "RESOLVED"
      ) {
        payoffSummary = {
          status: "INTERFACE_ONLY",

          details:
            "Awaiting verified delta-1 option sizing adapter",
        };
      } else if (
        spotPriceUSD > 0 &&
        preview.previewStatus ===
        "PREVIEW_AVAILABLE"
      ) {
        try {
          const quantity18 = scaleExact(
            BigInt(leg.resolvedOptionQuantity!.amountBaseUnits),
            leg.resolvedOptionQuantity!.decimals,
            18
          );
          payoffSummary = calculateExactLongPutPayoff({
            quantity18,
            strikePrice8: scaleExact(BigInt(quote.strikePrice.amountBaseUnits), quote.strikePrice.decimals, 8),
            spotPrice8: BigInt(spotPriceUSD.toFixed(8).replace(".", "")),
            totalCostUSDC6: scaleExact(BigInt(preview.totalExpectedCost.amountBaseUnits), preview.totalExpectedCost.decimals, 6),
            assetSymbol: targetAsset,
          });
        } catch {
          payoffSummary = {
            status: "NOT_AVAILABLE",
            details: "Exact modeled-at-expiry arithmetic could not be established.",
          };
        }
      }

      const candidate: CandidateStrategy =
      {
        strategyId: `strategy-${quote.quoteId}`,

        name:
          `Long Put Protection ($${strikeUSD.toFixed(
            0
          )} Strike)`,

        strategyType: "LONG_PUT",

        legs: [leg],

        quotes: [quote],

        status:
          sizingResult.sizingStatus ===
            "RESOLVED"
            ? "TECHNICALLY_FEASIBLE"
            : "SIZING_UNRESOLVED",

        rejectionReasons: [],

        scoresStatus:
          sizingResult.sizingStatus ===
            "RESOLVED"
            ? "EVALUATED"
            : "NOT_AVAILABLE",

        sizingStatus:
          sizingResult.sizingStatus,

        maxFillableContracts,

        liquiditySufficient,

        preview,

        underlyingResolutionMethod:
          "Chainlink PriceFeed deterministic mapping via ThetanutsMarketService",

        payoffSummary,
      };

      if (
        payoffSummary &&
        typeof payoffSummary ===
        "object" &&
        "effectiveDownsidePercent" in
        payoffSummary
      ) {
        candidate.metrics = {
          effectiveDownsidePercent:
            payoffSummary
              .effectiveDownsidePercent,

          totalProtectionCostUSD:
            payoffSummary
              .totalProtectionCostUSD,

          modeledProtectedFloorUSD:
            payoffSummary
              .protectedFloorValueUSD,

          costImpactPercent:
            payoffSummary
              .costImpactPercent,
        };
      }

      rawCandidates.push(candidate);
    }

    const feasibleCandidates: CandidateStrategy[] =
      [];

    for (const candidate of rawCandidates) {
      const quote =
        candidate.quotes[0];

      if (
        candidate.sizingStatus !==
        "RESOLVED"
      ) {
        candidate.status =
          "SIZING_UNRESOLVED";

        candidate.rank = undefined;

        candidate.scoresStatus =
          "NOT_AVAILABLE";

        unresolvedCandidates.push(
          candidate
        );

        continue;
      }

      if (
        quote?.executableNow !== true
      ) {
        candidate.status = "TECHNICALLY_REJECTED";
        candidate.rejectionReasons.push("Order is not executable now or its validity evidence is missing");
        rejectedCandidates.push(candidate);
        continue;
      }

      if (
        quote?.availableQuantity
          ?.amountBaseUnits === "0"
      ) {
        candidate.status =
          "TECHNICALLY_REJECTED";

        candidate.rejectionReasons.push(
          "Quote has zero available quantity"
        );

        rejectedCandidates.push(
          candidate
        );

        continue;
      }

      if (
        !candidate.preview ||
        candidate.preview
          .previewStatus !==
        "PREVIEW_AVAILABLE"
      ) {
        candidate.status =
          "PREVIEW_FAILED";

        candidate.rejectionReasons.push(
          `Read-only preview failed: ${candidate.preview?.error ||
          "preview unavailable"
          }`
        );

        rejectedCandidates.push(
          candidate
        );

        continue;
      }

      if (
        !candidate.liquiditySufficient
      ) {
        candidate.status =
          "LIQUIDITY_INSUFFICIENT";

        candidate.rejectionReasons.push(
          "Maker available collateral is insufficient to fill requested exposure quantity"
        );

        rejectedCandidates.push(
          candidate
        );

        continue;
      }

      if (
        quote &&
        quote.expiryTimestampMs > 0 &&
        quote.expiryTimestampMs <
        intent.horizonTimestamp.value
          .timestampMs
      ) {
        candidate.status =
          "EXPIRY_MISMATCH";

        candidate.rejectionReasons.push(
          "Quote expiry precedes user's confirmed protection horizon"
        );

        rejectedCandidates.push(
          candidate
        );

        continue;
      }

      const decision =
        await this.policyEngine.evaluatePolicy(
          intent,
          candidate,
          "ANALYSIS"
        );

      candidate.policyDecision =
        decision;

      if (
        !decision.passedAllInvariants
      ) {
        const failedChecks =
          decision.checks.filter(
            (check) =>
              check.status === "FAIL"
          );

        if (
          failedChecks.length > 0
        ) {
          for (const check of failedChecks) {
            candidate.rejectionReasons.push(
              check.details ||
              `Failed policy invariant ${check.ruleId}`
            );
          }
        } else {
          candidate.rejectionReasons.push(
            "Failed policy invariant"
          );
        }

        const failedRuleIds =
          new Set(
            failedChecks.map(
              (check) =>
                check.ruleId
            )
          );

        if (
          failedRuleIds.has(
            "POL-001"
          )
        ) {
          candidate.status =
            "BUDGET_REJECTED";
        } else if (
          failedRuleIds.has(
            "POL-009"
          )
        ) {
          candidate.status =
            "PROTECTION_TARGET_NOT_MET";
        } else {
          candidate.status =
            "POLICY_REJECTED";
        }

        rejectedCandidates.push(
          candidate
        );

        continue;
      }

      candidate.status =
        "TECHNICALLY_FEASIBLE";

      feasibleCandidates.push(
        candidate
      );
    }

    feasibleCandidates.sort(
      (a, b) => {
        const aDownside =
          (a.payoffSummary as any)
            ?.effectiveDownsidePercent ??
          999;

        const bDownside =
          (b.payoffSummary as any)
            ?.effectiveDownsidePercent ??
          999;

        const target =
          intent.targetMaxLossPercent
            .value;

        const aDiff =
          Math.abs(
            aDownside - target
          );

        const bDiff =
          Math.abs(
            bDownside - target
          );

        if (
          Math.abs(
            aDiff - bDiff
          ) > 0.5
        ) {
          return aDiff - bDiff;
        }

        const aCost =
          (a.payoffSummary as any)
            ?.totalProtectionCostUSD ??
          999;

        const bCost =
          (b.payoffSummary as any)
            ?.totalProtectionCostUSD ??
          999;

        return aCost - bCost;
      }
    );

    feasibleCandidates.forEach(
      (candidate, index) => {
        candidate.rank =
          index + 1;

        const downside =
          (candidate.payoffSummary as any)
            ?.effectiveDownsidePercent?.toFixed(
              1
            ) ?? "N/A";

        const cost =
          (candidate.payoffSummary as any)
            ?.totalProtectionCostUSD?.toFixed(
              2
            ) ?? "N/A";

        const budget =
          (
            Number(
              BigInt(
                intent.maxPremiumUSDC
                  .value
                  .amountBaseUnits
              )
            ) /
            10 **
            intent.maxPremiumUSDC
              .value.decimals
          ).toFixed(2);

        candidate.rankExplanation =
          `Rank #${index + 1}: modeled at-expiry downside ${downside}% ` +
          `(target: ${intent.targetMaxLossPercent.value}%) ` +
          `for ${cost} USDC ` +
          `(confirmed budget: ${budget} USDC).`;

        candidate.metrics = {
          effectiveDownsidePercent:
            (
              candidate.payoffSummary as any
            )
              ?.effectiveDownsidePercent,

          totalProtectionCostUSD:
            (
              candidate.payoffSummary as any
            )
              ?.totalProtectionCostUSD,

          modeledProtectedFloorUSD:
            (
              candidate.payoffSummary as any
            )
              ?.protectedFloorValueUSD,

          costImpactPercent:
            (
              candidate.payoffSummary as any
            )
              ?.costImpactPercent,
        };
      }
    );

    return {
      rankedStrategies: [
        ...feasibleCandidates,
        ...unresolvedCandidates,
      ],

      rejectedCandidates,
    };
  }

  private buildUnconfirmedIntentRejection(
    intent: TypedRiskIntent,
    quotes: MarketQuote[]
  ): CandidateStrategy {
    const firstQuote =
      quotes[0];

    const legs: OptionLeg[] =
      firstQuote
        ? [
          {
            side: "BUY",

            right:
              firstQuote.optionRight,

            strikePrice:
              firstQuote.strikePrice,

            expiryTimestampMs:
              firstQuote.expiryTimestampMs,

            requestedExposure:
              intent.exposureAmount.value,

            sizingStatus:
              "NOT_RESOLVED",

            quoteReference:
              firstQuote.quoteId,
          },
        ]
        : [];

    return {
      strategyId:
        `blocked-unconfirmed-${intent.intentId}`,

      name:
        "Protection analysis blocked",

      strategyType:
        "LONG_PUT",

      legs,

      quotes:
        firstQuote
          ? [firstQuote]
          : [],

      status:
        "POLICY_REJECTED",

      rejectionReasons: [
        "Intent has not been explicitly confirmed by user",
      ],

      scoresStatus:
        "NOT_AVAILABLE",

      sizingStatus:
        "NOT_RESOLVED",

      liquiditySufficient:
        undefined,

      underlyingResolutionMethod:
        "NOT_EVALUATED_UNCONFIRMED_INTENT",
    };
  }

  public async solveProtectionPipeline(
    intent: TypedRiskIntent,
    quotes: MarketQuote[]
  ): Promise<ProtectionSolverPipelineResult> {
    /*
     * SEC-007:
     * No financial solving may begin until the
     * user has explicitly confirmed the Typed Risk Intent.
     *
     * This check happens before market analysis,
     * policy evaluation, proposal creation or simulation.
     */
    if (!intent.confirmedByUser) {
      return {
        mode: "RFQ_REQUIRED",

        rankedStrategies: [],

        rejectedCandidates: [
          this.buildUnconfirmedIntentRejection(
            intent,
            quotes
          ),
        ],

        rfqRequirement: {
          status: "INCOMPLETE",

          reasons: [],

          explanation:
            "Protection solving was not evaluated because the risk intent has not been explicitly confirmed by the user.",
        },

        policyDecisions: {},
      };
    }

    const optionBookResult =
      await this.evaluateCandidates(
        intent,
        quotes
      );

    const policyDecisions: Record<
      string,
      PolicyDecisionRecord
    > = {};

    for (const candidate of [
      ...optionBookResult
        .rankedStrategies,

      ...optionBookResult
        .rejectedCandidates,
    ]) {
      if (
        candidate.policyDecision
      ) {
        policyDecisions[
          candidate.strategyId
        ] =
          candidate.policyDecision;
      }
    }

    let spotPriceUSD = 0;

    try {
      spotPriceUSD =
        await this.marketService.getSpotPrice(
          intent.asset.value
        );
    } catch {
      spotPriceUSD = 0;
    }

    const feasibleOptionBookCandidates =
      optionBookResult.rankedStrategies.filter(
        (candidate) =>
          candidate.status ===
          "TECHNICALLY_FEASIBLE" &&
          candidate.liquiditySufficient !==
          false
      );

    if (
      feasibleOptionBookCandidates.length >
      0
    ) {
      const topCandidate =
        feasibleOptionBookCandidates.find(
          (candidate) =>
            candidate.rank === 1
        ) ||
        feasibleOptionBookCandidates[0];

      const actionProposal =
        ActionProposalBuilder.buildOptionBookProposal(
          intent,
          topCandidate,
          this.marketService
        );

      const simulationResult =
        await this.simulationService.simulateProposal(
          actionProposal,
          intent,
          topCandidate,
          spotPriceUSD
        );

      const effectiveDownsidePercent =
        topCandidate.metrics
          ?.effectiveDownsidePercent ??
        (
          topCandidate.payoffSummary as any
        )
          ?.effectiveDownsidePercent;

      const humanReviewRecord =
        HumanReviewService.createReviewRecord(
          intent,
          actionProposal,
          simulationResult,
          effectiveDownsidePercent
        );

      return {
        mode:
          "OPTIONBOOK_AVAILABLE",

        rankedStrategies:
          feasibleOptionBookCandidates,

        rejectedCandidates:
          optionBookResult
            .rejectedCandidates,

        rfqRequirement: {
          status:
            "NOT_REQUIRED",

          reasons: [],

          explanation:
            "Eligible OptionBook liquidity is available to fulfill the protection objective directly.",
        },

        actionProposal,

        simulationResult,

        humanReviewRecord,

        policyDecisions,
      };
    }

    const rfqRequirement =
      RFQRequirementEngine.evaluateRequirement(
        intent,
        optionBookResult
          .rankedStrategies,
        optionBookResult
          .rejectedCandidates
      );

    const specificationResult =
      RFQSpecificationBuilder.buildSpecification(
        intent,
        spotPriceUSD,
        rfqRequirement.reasons,
        this.marketService
      );

    const rfqProposal =
      ActionProposalBuilder.buildRFQProposal(
        intent,
        specificationResult
          .specification,
        this.marketService
      );

    const rfqSimulation =
      await this.simulationService.simulateProposal(
        rfqProposal,
        intent,
        undefined,
        spotPriceUSD
      );

    const rfqReviewRecord =
      HumanReviewService.createReviewRecord(
        intent,
        rfqProposal,
        rfqSimulation,
        undefined
      );

    const rfqCandidate: CandidateStrategy =
    {
      strategyId:
        `strat-${specificationResult.specification.rfqSpecId}`,

      name:
        `Custom Protection Quote (${specificationResult
          .specification
          .strategyType ===
          "PUT_SPREAD"
          ? "Put Spread"
          : "Long Put"
        })`,

      strategyType:
        specificationResult
          .specification
          .strategyType,

      legs:
        specificationResult
          .candidateLegs,

      quotes: [],

      status:
        "RFQ_SPECIFICATION_READY",

      rejectionReasons: [],

      scoresStatus:
        "NOT_AVAILABLE",

      sizingStatus:
        specificationResult
          .specification
          .validationStatus ===
          "VALID"
          ? "RESOLVED"
          : "NOT_RESOLVED",

      underlyingResolutionMethod:
        "RFQ_SPECIFICATION_DERIVATION",

      ...({
        underlying:
          specificationResult
            .specification
            .underlying,

        protocol:
          "THETANUTS",
      } as any),
    };

    const rfqPolicyDecision =
      await this.policyEngine.evaluatePolicy(
        intent,
        rfqCandidate,
        "RFQ_SPECIFICATION"
      );

    rfqCandidate.policyDecision =
      rfqPolicyDecision;

    policyDecisions[
      rfqCandidate.strategyId
    ] = rfqPolicyDecision;

    return {
      mode: "RFQ_REQUIRED",

      rankedStrategies: [],

      rejectedCandidates:
        optionBookResult
          .rejectedCandidates,

      rfqRequirement,

      rfqSpecification:
        specificationResult
          .specification,

      actionProposal:
        rfqProposal,

      simulationResult:
        rfqSimulation,

      humanReviewRecord:
        rfqReviewRecord,

      policyDecisions,
    };
  }
}
