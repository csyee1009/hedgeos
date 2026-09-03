import { PolicyEngine } from "../providers/interfaces/PolicyEngine";
import {
  CandidateStrategy,
  PolicyCheckItem,
  PolicyDecisionRecord,
  PolicyDecisionStatus,
  PolicyEvaluationStage,
  TypedRiskIntent,
} from "../types";

export class FinancialConstitutionEngine implements PolicyEngine {
  public async evaluatePolicy(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy,
    stage: PolicyEvaluationStage = "EXECUTION"
  ): Promise<PolicyDecisionRecord> {
    const checks: PolicyCheckItem[] = [];
    const isMultiLeg = candidate.legs.length > 1 || candidate.strategyType === "PUT_SPREAD";

    // POL-001: Budget Constraint Policy
    const quoteCost = candidate.preview?.totalExpectedCost || candidate.quotes[0]?.premium;

    if (!quoteCost) {
      if (stage === "RFQ_SPECIFICATION") {
        checks.push({
          ruleId: "POL-001",
          description: "Transaction premium does not exceed user's confirmed maximum budget limit",
          status: "NOT_EVALUATED",
          details: "Budget evaluation pending RFQ market maker quotation pricing (unknown before quotes arrive)",
        });
      } else {
        checks.push({
          ruleId: "POL-001",
          description: "Transaction premium does not exceed user's confirmed maximum budget limit",
          status: "FAIL",
          details: "No verified preview pricing or quote premium available to evaluate budget limit",
        });
      }
    } else {
      const budgetSymbol = intent.maxPremiumUSDC.value.symbol.toUpperCase();
      const quoteSymbol = quoteCost.symbol.toUpperCase();

      // Step 1: Denomination symbol check
      if (quoteSymbol !== budgetSymbol) {
        checks.push({
          ruleId: "POL-001",
          description: "Transaction premium denomination matches user's confirmed budget currency",
          status: "FAIL",
          details: `Denomination mismatch: Premium token symbol (${quoteCost.symbol}) does not match budget symbol (${intent.maxPremiumUSDC.value.symbol})`,
        });
      } else {
        // Step 2: Decimal normalization using pure BigInt arithmetic
        const quoteDecimals = quoteCost.decimals;
        const budgetDecimals = intent.maxPremiumUSDC.value.decimals;

        const quoteAmount = BigInt(quoteCost.amountBaseUnits);
        const budgetAmount = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);

        let normalizedQuote = quoteAmount;
        let normalizedBudget = budgetAmount;

        if (quoteDecimals < budgetDecimals) {
          normalizedQuote = quoteAmount * 10n ** BigInt(budgetDecimals - quoteDecimals);
        } else if (quoteDecimals > budgetDecimals) {
          normalizedBudget = budgetAmount * 10n ** BigInt(quoteDecimals - budgetDecimals);
        }

        const isWithinBudget = normalizedQuote <= normalizedBudget;

        checks.push({
          ruleId: "POL-001",
          description: "Transaction premium does not exceed user's confirmed maximum budget limit",
          status: isWithinBudget ? "PASS" : "FAIL",
          details: isWithinBudget
            ? `Normalized premium (${normalizedQuote.toString()}) <= Normalized budget (${normalizedBudget.toString()})`
            : `Normalized premium (${normalizedQuote.toString()}) exceeds normalized budget (${normalizedBudget.toString()})`,
        });
      }
    }

    // POL-002: Target Asset Policy (Evidence must come strictly from candidate/specification, never defaulted from intent)
    const intentAsset = intent.asset.value.toUpperCase();
    const candidateAsset = candidate.quotes[0]?.asset?.toUpperCase() || (candidate as any).underlying?.toUpperCase();

    if (!candidateAsset) {
      checks.push({
        ruleId: "POL-002",
        description: "Candidate option underlying asset matches user's target risk exposure",
        status: "FAIL",
        details: "Candidate provides no underlying asset evidence",
      });
    } else {
      const isAssetMatch = intentAsset === candidateAsset;
      checks.push({
        ruleId: "POL-002",
        description: "Candidate option underlying asset matches user's target risk exposure",
        status: isAssetMatch ? "PASS" : "FAIL",
        details: isAssetMatch
          ? `Asset matches: ${candidateAsset}`
          : `Asset mismatch: candidate is for ${candidateAsset}, but user intended ${intentAsset}`,
      });
    }

    // POL-003: Allowed Protocols Policy (Evidence must come strictly from candidate/specification, never defaulted to THETANUTS)
    const allowed = intent.allowedProtocols.value.map((p) => p.toUpperCase());
    const candidateProtocol = candidate.quotes[0]?.protocol || (candidate as any).protocol;

    if (!candidateProtocol) {
      checks.push({
        ruleId: "POL-003",
        description: "Candidate protocol is within user's allowed protocol whitelist",
        status: "FAIL",
        details: "Candidate provides no protocol provenance evidence",
      });
    } else {
      const isProtocolAllowed = allowed.includes(candidateProtocol.toUpperCase());
      checks.push({
        ruleId: "POL-003",
        description: "Candidate protocol is within user's allowed protocol whitelist",
        status: isProtocolAllowed ? "PASS" : "FAIL",
        details: isProtocolAllowed
          ? `Protocol ${candidateProtocol} is whitelisted`
          : `Protocol ${candidateProtocol} is not in whitelist (${allowed.join(", ")})`,
      });
    }

    // POL-004: Execution Approval Security Policy
    if (stage === "EXECUTION") {
      checks.push({
        ruleId: "POL-004",
        description: "Execution proposal is authorized and unlimited token approvals are prohibited",
        status: "NOT_EVALUATED",
        details: "Execution proposal authorization required before transaction submission",
      });
    } else if (stage === "RFQ_SPECIFICATION") {
      checks.push({
        ruleId: "POL-004",
        description: "Execution proposal is authorized and unlimited token approvals are prohibited",
        status: "NOT_EVALUATED",
        details: "Execution authorization boundary respected (RFQ specification only, not submitted)",
      });
    } else {
      checks.push({
        ruleId: "POL-004",
        description: "Execution proposal is authorized and unlimited token approvals are prohibited",
        status: "NOT_EVALUATED",
        details: "Pre-execution analysis only; signing and wallet submission not requested",
      });
    }

    // POL-005: User Intent Confirmation Policy
    const isConfirmed = intent.confirmedByUser === true;
    checks.push({
      ruleId: "POL-005",
      description: "Candidate is bound to an explicitly user-confirmed TypedRiskIntent",
      status: isConfirmed ? "PASS" : "FAIL",
      details: isConfirmed
        ? `Intent ${intent.intentId} (v${intent.version}) confirmed by user at ${intent.confirmedAtMs ? new Date(intent.confirmedAtMs).toISOString() : "timestamp verified"}`
        : "Intent has not been explicitly confirmed by user",
    });

    // POL-006: Protection Horizon Matching Policy
    const userHorizonMs = intent.horizonTimestamp.value.timestampMs;
    const candidateExpiryMs = candidate.legs[0]?.expiryTimestampMs || candidate.quotes[0]?.expiryTimestampMs;

    if (!candidateExpiryMs) {
      checks.push({
        ruleId: "POL-006",
        description: "Candidate option expiration covers user's confirmed protection horizon",
        status: "FAIL",
        details: "No expiration timestamp found on candidate option leg",
      });
    } else {
      const isHorizonSufficient = candidateExpiryMs >= userHorizonMs;
      checks.push({
        ruleId: "POL-006",
        description: "Candidate option expiration covers user's confirmed protection horizon",
        status: isHorizonSufficient ? "PASS" : "FAIL",
        details: isHorizonSufficient
          ? `Option expiry (${new Date(candidateExpiryMs).toISOString()}) covers horizon (${new Date(userHorizonMs).toISOString()})`
          : `Option expires (${new Date(candidateExpiryMs).toISOString()}) before user's requested horizon (${new Date(userHorizonMs).toISOString()})`,
      });
    }

    // POL-007: Multi-Leg Strategy Authorization Policy
    if (isMultiLeg) {
      const userAllowedMultiLeg = intent.allowMultiLeg?.value === true;
      checks.push({
        ruleId: "POL-007",
        description: "Multi-leg option structures (e.g. Put Spread) require explicit user authorization",
        status: userAllowedMultiLeg ? "PASS" : "FAIL",
        details: userAllowedMultiLeg
          ? "User has explicitly enabled multi-leg strategy authorization"
          : "Strategy is a multi-leg structure (Put Spread) but user has allowMultiLeg = false",
      });
    }

    // POL-008: Sizing Resolution & Liquidity Adequacy Policy (Always exists)
    const sizingResolved = candidate.sizingStatus === "RESOLVED";
    const liquidityAdequate = candidate.liquiditySufficient !== false;
    const pol008Passed = sizingResolved && (stage === "RFQ_SPECIFICATION" ? true : liquidityAdequate);

    checks.push({
      ruleId: "POL-008",
      description: "Option sizing is verified and maker orderbook liquidity satisfies requested exposure",
      status: pol008Passed ? "PASS" : "FAIL",
      details: pol008Passed
        ? stage === "RFQ_SPECIFICATION"
          ? "Option sizing verified for RFQ specification"
          : "Option sizing verified and liquidity adequate"
        : !sizingResolved
        ? "Option sizing is NOT resolved"
        : "Orderbook available liquidity is insufficient for requested exposure",
    });

    // POL-009: Protection Target Downside Floor Policy (Always exists)
    if (candidate.payoffSummary && "effectiveDownsidePercent" in candidate.payoffSummary) {
      const effectiveDownside = candidate.payoffSummary.effectiveDownsidePercent;
      const targetLoss = intent.targetMaxLossPercent?.value ?? 8;
      const pol009Passed = effectiveDownside <= targetLoss;

      checks.push({
        ruleId: "POL-009",
        description: "Calculated at-expiry downside does not exceed user's confirmed target max loss",
        status: pol009Passed ? "PASS" : "FAIL",
        details: pol009Passed
          ? `Calculated effective downside (${effectiveDownside}%) <= confirmed target (${targetLoss}%)`
          : `Calculated effective downside (${effectiveDownside}%) exceeds confirmed target (${targetLoss}%)`,
      });
    } else {
      checks.push({
        ruleId: "POL-009",
        description: "Calculated at-expiry downside does not exceed user's confirmed target max loss",
        status: "NOT_EVALUATED",
        details: "Target downside evaluation pending RFQ quotation pricing (unknown before quotes arrive)",
      });
    }

    // Overall Status Determination
    const hasFail = checks.some((c) => c.status === "FAIL");
    let overallStatus: PolicyDecisionStatus = "PASS";
    let passedAllInvariants = false;

    if (hasFail) {
      overallStatus = "FAIL";
      passedAllInvariants = false;
    } else if (stage === "ANALYSIS") {
      // In ANALYSIS stage, POL-004 being NOT_EVALUATED does NOT invalidate analysis eligibility
      const analysisChecks = checks.filter((c) => c.ruleId !== "POL-004");
      const allAnalysisPass = analysisChecks.every((c) => c.status === "PASS");
      if (allAnalysisPass) {
        overallStatus = "PASS";
        passedAllInvariants = true;
      } else {
        overallStatus = "INCOMPLETE";
        passedAllInvariants = false;
      }
    } else if (stage === "RFQ_SPECIFICATION") {
      // Audit Item 5: In RFQ_SPECIFICATION stage, financial policy remains INCOMPLETE because pricing is unknown
      // Do NOT falsely mark overallStatus = PASS or passedAllInvariants = true
      overallStatus = "INCOMPLETE";
      passedAllInvariants = false;
    } else {
      const hasNotEvaluated = checks.some((c) => c.status === "NOT_EVALUATED");
      if (hasNotEvaluated) {
        overallStatus = "INCOMPLETE";
        passedAllInvariants = false;
      } else {
        overallStatus = "PASS";
        passedAllInvariants = true;
      }
    }

    return {
      decisionId: `decision-${Math.random().toString(36).substring(2, 9)}`,
      intentId: intent.intentId,
      strategyId: candidate.strategyId,
      overallStatus,
      passedAllInvariants,
      stage,
      checks,
      timestampMs: Date.now(),
    };
  }
}
