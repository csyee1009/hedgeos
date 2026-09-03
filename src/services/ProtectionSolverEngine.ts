import {
  ActionProposal,
  CandidateStrategy,
  HumanReviewRecord,
  MarketQuote,
  OptionLeg,
  PolicyDecisionRecord,
  ProtectionSolverPipelineResult,
  RFQSpecification,
  SimulationResult,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { ActionProposalBuilder } from "./ActionProposalBuilder";
import { ExposurePayoffEngine } from "./ExposurePayoffEngine";
import { FinancialConstitutionEngine } from "./FinancialConstitutionEngine";
import { HumanReviewService } from "./HumanReviewService";
import { OptionSizingAdapter } from "./OptionSizingAdapter";
import { RFQRequirementEngine } from "./RFQRequirementEngine";
import { RFQSpecificationBuilder } from "./RFQSpecificationBuilder";
import { ThetanutsMarketService } from "./ThetanutsMarketService";
import { ThetanutsSimulationService } from "./ThetanutsSimulationService";

export class ProtectionSolverEngine {
  private policyEngine: FinancialConstitutionEngine;
  private simulationService: ThetanutsSimulationService;

  constructor(
    private marketService: ThetanutsMarketService = new ThetanutsMarketService(),
    policyEngine?: FinancialConstitutionEngine
  ) {
    this.policyEngine = policyEngine || new FinancialConstitutionEngine();
    this.simulationService = new ThetanutsSimulationService(this.marketService);
  }

  public async evaluateCandidates(
    intent: TypedRiskIntent,
    quotes: MarketQuote[]
  ): Promise<{
    rankedStrategies: CandidateStrategy[];
    rejectedCandidates: CandidateStrategy[];
  }> {
    const rawCandidates: CandidateStrategy[] = [];
    const rejectedCandidates: CandidateStrategy[] = [];

    // Step 1: Query live spot price for underlying
    const targetAsset = intent.asset.value.toUpperCase();
    let spotPriceUSD = 0;
    try {
      spotPriceUSD = await this.marketService.getSpotPrice(targetAsset);
    } catch {
      spotPriceUSD = 0;
    }

    const exposureQuantityNum = Number(BigInt(intent.exposureAmount.value.amountBaseUnits)) / 10 ** intent.exposureAmount.value.decimals;

    // Step 2: Filter quotes strictly by matching asset and Option Right = PUT
    const putQuotes = quotes.filter((q) => {
      const underlying = q.asset.toUpperCase();
      return (
        (underlying === targetAsset ||
          (targetAsset === "ETH" && underlying === "WETH") ||
          (targetAsset === "BTC" && underlying === "CBBTC")) &&
        q.optionRight === "PUT"
      );
    });

    for (const q of putQuotes) {
      const strikeUSD = Number(BigInt(q.strikePrice.amountBaseUnits)) / 10 ** q.strikePrice.decimals;

      // Step 3: Verified Delta-1 Sizing via OptionSizingAdapter
      const sizingResult = OptionSizingAdapter.resolveSizing(intent.exposureAmount.value, targetAsset);

      const leg: OptionLeg = {
        side: "BUY",
        right: "PUT",
        strikePrice: q.strikePrice,
        expiryTimestampMs: q.expiryTimestampMs,
        requestedExposure: intent.exposureAmount.value,
        resolvedOptionQuantity: sizingResult.resolvedOptionQuantity,
        sizingStatus: sizingResult.sizingStatus,
        quoteReference: q.quoteId,
      };

      // Step 4: Max-fillable & Liquidity evaluation
      let maxFillableContracts: TokenAmount | undefined = undefined;
      let liquiditySufficient = false;

      if (q.availableQuantity) {
        if (q.availableQuantity.amountBaseUnits === "0") {
          liquiditySufficient = false;
        } else if (q.availableQuantity.decimals === 6) {
          let maxContracts18 = 0n;
          if (q.availableQuantity.symbol === "CONTRACTS") {
            maxContracts18 = BigInt(q.availableQuantity.amountBaseUnits) * 1000000000000n;
          } else {
            const maxContractsSDK = this.marketService.calculateMaxContracts(q);
            maxContracts18 = maxContractsSDK * 1000000000000n;
          }
          maxFillableContracts = {
            amountBaseUnits: maxContracts18.toString(),
            decimals: 18,
            symbol: "CONTRACTS",
          };
          const reqBaseUnits = BigInt(leg.resolvedOptionQuantity?.amountBaseUnits || "0");
          liquiditySufficient = maxContracts18 >= reqBaseUnits && reqBaseUnits > 0n;
        } else {
          maxFillableContracts = q.availableQuantity;
          const reqBaseUnits = BigInt(leg.resolvedOptionQuantity?.amountBaseUnits || "0");
          const availBaseUnits = BigInt(q.availableQuantity.amountBaseUnits);
          liquiditySufficient = availBaseUnits >= reqBaseUnits && reqBaseUnits > 0n;
        }
      }

      // Step 5: Read-only preview
      const preview = await this.marketService.previewFill(
        q,
        BigInt(leg.resolvedOptionQuantity?.amountBaseUnits || intent.exposureAmount.value.amountBaseUnits)
      );

      // Step 6: Modeled At-Expiry Payoff Analysis
      const totalCostUSD = preview
        ? Number(BigInt(preview.totalExpectedCost.amountBaseUnits)) / 10 ** preview.totalExpectedCost.decimals
        : Number(BigInt(q.premium.amountBaseUnits)) / 10 ** q.premium.decimals;

      let payoffSummary: any = undefined;
      if (sizingResult.sizingStatus !== "RESOLVED") {
        payoffSummary = {
          status: "INTERFACE_ONLY",
          details: "Awaiting verified delta-1 option sizing adapter",
        };
      } else if (spotPriceUSD > 0) {
        payoffSummary = ExposurePayoffEngine.calculate({
          spotQuantity: exposureQuantityNum,
          optionQuantity: exposureQuantityNum,
          strikePriceUSD: strikeUSD,
          spotReferencePriceUSD: spotPriceUSD,
          totalProtectionCostUSD: totalCostUSD,
          assetSymbol: targetAsset,
        });
      }

      const candidate: CandidateStrategy = {
        strategyId: `strategy-${q.quoteId}`,
        name: `Long Put Protection ($${strikeUSD.toFixed(0)} Strike)`,
        strategyType: "LONG_PUT",
        legs: [leg],
        quotes: [q],
        status: sizingResult.sizingStatus === "RESOLVED" ? "TECHNICALLY_FEASIBLE" : "SIZING_UNRESOLVED",
        rejectionReasons: [],
        scoresStatus: sizingResult.sizingStatus === "RESOLVED" ? "EVALUATED" : "NOT_AVAILABLE",
        sizingStatus: sizingResult.sizingStatus,
        maxFillableContracts,
        liquiditySufficient,
        preview,
        underlyingResolutionMethod: "Chainlink PriceFeed deterministic mapping via ThetanutsMarketService",
        payoffSummary,
      };

      rawCandidates.push(candidate);
    }

    const eligibleCandidates: CandidateStrategy[] = [];

    // Step 7: Single Policy Authority Evaluation via FinancialConstitutionEngine
    for (const candidate of rawCandidates) {
      const q = candidate.quotes[0];

      // Sizing unverified
      if (candidate.sizingStatus !== "RESOLVED") {
        candidate.status = "SIZING_UNRESOLVED";
        candidate.rank = undefined;
        candidate.scoresStatus = "NOT_AVAILABLE";
        eligibleCandidates.push(candidate);
        continue;
      }

      // Zero quantity rejection
      if (q && q.availableQuantity?.amountBaseUnits === "0") {
        candidate.status = "TECHNICALLY_REJECTED";
        candidate.rejectionReasons.push("Quote has zero available quantity");
        rejectedCandidates.push(candidate);
        continue;
      }

      // Preview failed
      if (!candidate.preview || candidate.preview.previewStatus !== "PREVIEW_AVAILABLE") {
        candidate.status = "PREVIEW_FAILED";
        candidate.rejectionReasons.push(`Read-only preview failed: ${candidate.preview?.error || "preview unavailable"}`);
        rejectedCandidates.push(candidate);
        continue;
      }

      // Liquidity insufficient
      if (!candidate.liquiditySufficient) {
        candidate.status = "LIQUIDITY_INSUFFICIENT";
        candidate.rejectionReasons.push("Maker available collateral is insufficient to fill requested exposure quantity");
        rejectedCandidates.push(candidate);
        continue;
      }

      // Horizon mismatch
      if (q && q.expiryTimestampMs > 0 && q.expiryTimestampMs < intent.horizonTimestamp.value.timestampMs) {
        candidate.status = "EXPIRY_MISMATCH";
        candidate.rejectionReasons.push("Quote expiry precedes user's confirmed protection horizon");
        rejectedCandidates.push(candidate);
        continue;
      }

      // Evaluate Financial Constitution policy
      const decision = await this.policyEngine.evaluatePolicy(intent, candidate, "ANALYSIS");
      candidate.policyDecision = decision;

      if (!decision.passedAllInvariants) {
        const failedCheck = decision.checks.find((c) => c.status === "FAIL");
        const ruleId = failedCheck?.ruleId || "POL";
        if (ruleId === "POL-001") {
          candidate.status = "BUDGET_REJECTED";
        } else if (ruleId === "POL-009") {
          candidate.status = "PROTECTION_TARGET_NOT_MET";
        } else {
          candidate.status = "POLICY_REJECTED";
        }
        candidate.rejectionReasons.push(failedCheck?.details || "Failed policy invariant");
        rejectedCandidates.push(candidate);
        continue;
      }

      // Candidate is fully eligible
      candidate.status = "TECHNICALLY_FEASIBLE";
      eligibleCandidates.push(candidate);
    }

    // Step 8: Deterministic Explainable Ranking for Eligible Candidates
    const fullyFeasible = eligibleCandidates.filter((c) => c.status === "TECHNICALLY_FEASIBLE");

    fullyFeasible.sort((a, b) => {
      const aDownside = (a.payoffSummary as any)?.effectiveDownsidePercent ?? 999;
      const bDownside = (b.payoffSummary as any)?.effectiveDownsidePercent ?? 999;
      const target = intent.targetMaxLossPercent.value;

      const aDiff = Math.abs(aDownside - target);
      const bDiff = Math.abs(bDownside - target);

      // Primary: downside objective fit
      if (Math.abs(aDiff - bDiff) > 0.5) {
        return aDiff - bDiff;
      }

      // Secondary: lower verified total protection cost
      const aCost = (a.payoffSummary as any)?.totalProtectionCostUSD ?? 999;
      const bCost = (b.payoffSummary as any)?.totalProtectionCostUSD ?? 999;
      return aCost - bCost;
    });

    fullyFeasible.forEach((cand, idx) => {
      cand.rank = idx + 1;
      const downside = (cand.payoffSummary as any)?.effectiveDownsidePercent?.toFixed(1) ?? "N/A";
      const cost = (cand.payoffSummary as any)?.totalProtectionCostUSD?.toFixed(2) ?? "N/A";
      const budget = (Number(BigInt(intent.maxPremiumUSDC.value.amountBaseUnits)) / 10 ** intent.maxPremiumUSDC.value.decimals).toFixed(2);

      cand.rankExplanation = `Rank #${idx + 1}: Provides ${downside}% modeled downside protection (target: ${intent.targetMaxLossPercent.value}%) for $${cost} USDC (confirmed budget: $${budget} USDC).`;

      cand.metrics = {
        effectiveDownsidePercent: (cand.payoffSummary as any)?.effectiveDownsidePercent,
        totalProtectionCostUSD: (cand.payoffSummary as any)?.totalProtectionCostUSD,
        modeledProtectedFloorUSD: (cand.payoffSummary as any)?.protectedFloorValueUSD,
        costImpactPercent: (cand.payoffSummary as any)?.costImpactPercent,
      };
    });

    return {
      rankedStrategies: eligibleCandidates,
      rejectedCandidates,
    };
  }

  /**
   * Orchestrates the complete Protection Solver Pipeline:
   * 1. Evaluates Live OptionBook candidates
   * 2. If OptionBook has eligible liquidity -> OPTIONBOOK_AVAILABLE -> builds ActionProposal, simulates read-only, generates HumanReviewRecord.
   * 3. If OptionBook liquidity is insufficient -> RFQ_REQUIRED -> builds RFQSpecification, builds ActionProposal, sets simulation as NOT_AVAILABLE.
   */
  public async solveProtectionPipeline(
    intent: TypedRiskIntent,
    quotes: MarketQuote[]
  ): Promise<ProtectionSolverPipelineResult> {
    const obResult = await this.evaluateCandidates(intent, quotes);
    const policyDecisions: Record<string, PolicyDecisionRecord> = {};
    const nowMs = Date.now();

    for (const cand of obResult.rankedStrategies) {
      if (cand.policyDecision) {
        policyDecisions[cand.strategyId] = cand.policyDecision;
      }
    }

    let spotPriceUSD = 0;
    try {
      spotPriceUSD = await this.marketService.getSpotPrice(intent.asset.value);
    } catch {
      spotPriceUSD = 0;
    }

    const hasEligibleOB = obResult.rankedStrategies.some(
      (c) => c.status === "TECHNICALLY_FEASIBLE" && c.liquiditySufficient !== false
    );

    if (hasEligibleOB) {
      const topCandidate = obResult.rankedStrategies.find((c) => c.rank === 1) || obResult.rankedStrategies[0];
      const actionProposal = ActionProposalBuilder.buildOptionBookProposal(intent, topCandidate, this.marketService);
      const simulationResult = await this.simulationService.simulateProposal(
        actionProposal,
        intent,
        topCandidate,
        spotPriceUSD
      );

      const effectiveDownsidePercent =
        topCandidate.metrics?.effectiveDownsidePercent ??
        (topCandidate.payoffSummary as any)?.effectiveDownsidePercent;

      const humanReviewRecord = HumanReviewService.createReviewRecord(
        intent,
        actionProposal,
        simulationResult,
        effectiveDownsidePercent
      );

      return {
        mode: "OPTIONBOOK_AVAILABLE",
        rankedStrategies: obResult.rankedStrategies,
        rejectedCandidates: obResult.rejectedCandidates,
        rfqRequirement: {
          status: "NOT_REQUIRED",
          reasons: [],
          explanation: "Eligible OptionBook liquidity is available to fulfill protection objective directly.",
        },
        actionProposal,
        simulationResult,
        humanReviewRecord,
        policyDecisions,
      };
    }

    // OptionBook is insufficient -> RFQ Fallback Requirement Analysis
    const rfqRequirement = RFQRequirementEngine.evaluateRequirement(
      intent,
      obResult.rankedStrategies,
      obResult.rejectedCandidates
    );

    const specResult = RFQSpecificationBuilder.buildSpecification(
      intent,
      spotPriceUSD,
      rfqRequirement.reasons,
      this.marketService
    );

    const rfqProposal = ActionProposalBuilder.buildRFQProposal(intent, specResult.specification, this.marketService);
    const rfqSimulation = await this.simulationService.simulateProposal(
      rfqProposal,
      intent,
      undefined,
      spotPriceUSD
    );

    const rfqReviewRecord = HumanReviewService.createReviewRecord(
      intent,
      rfqProposal,
      rfqSimulation,
      undefined // Sealed unpriced RFQ has no calculated downside percentage
    );

    // Build CandidateStrategy representation for the RFQ specification
    const rfqCandidate: CandidateStrategy = {
      strategyId: `strat-${specResult.specification.rfqSpecId}`,
      name: `Custom Protection Quote (${specResult.specification.strategyType === "PUT_SPREAD" ? "Put Spread" : "Long Put"})`,
      strategyType: specResult.specification.strategyType,
      legs: specResult.candidateLegs,
      quotes: [],
      status: "RFQ_SPECIFICATION_READY",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: specResult.specification.validationStatus === "VALID" ? "RESOLVED" : "NOT_RESOLVED",
      underlyingResolutionMethod: "RFQ_SPECIFICATION_DERIVATION",
      ...( { underlying: specResult.specification.underlying, protocol: "THETANUTS" } as any ),
    };

    const rfqPolicyDecision = await this.policyEngine.evaluatePolicy(
      intent,
      rfqCandidate,
      "RFQ_SPECIFICATION"
    );
    rfqCandidate.policyDecision = rfqPolicyDecision;
    policyDecisions[rfqCandidate.strategyId] = rfqPolicyDecision;

    return {
      mode: "RFQ_REQUIRED",
      rankedStrategies: [],
      rejectedCandidates: obResult.rejectedCandidates,
      rfqRequirement,
      rfqSpecification: specResult.specification,
      actionProposal: rfqProposal,
      simulationResult: rfqSimulation,
      humanReviewRecord: rfqReviewRecord,
      policyDecisions,
    };
  }
}
