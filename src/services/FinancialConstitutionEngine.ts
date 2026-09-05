import { PolicyEngine } from "../providers/interfaces/PolicyEngine";
import {
  CandidateStrategy,
  PolicyCheckItem,
  PolicyDecisionRecord,
  PolicyDecisionStatus,
  PolicyEvaluationStage,
  TokenAmount,
  TypedRiskIntent,
} from "../types";

const normalizeAsset = (asset: string): string => {
  const normalized = asset.toUpperCase();

  if (normalized === "WETH") {
    return "ETH";
  }

  if (normalized === "CBBTC") {
    return "BTC";
  }

  return normalized;
};

const getVerifiedCost = (
  candidate: CandidateStrategy
): TokenAmount | undefined => {
  if (
    candidate.preview?.previewStatus ===
    "PREVIEW_AVAILABLE"
  ) {
    if (
      candidate.preview.feeStatus === "AVAILABLE" ||
      candidate.preview.feeStatus === "ZERO_VERIFIED"
    ) {
      return candidate.preview.totalExpectedCost;
    }

    return undefined;
  }

  const quotePremium =
    candidate.quotes[0]?.premium;

  if (!quotePremium) {
    return undefined;
  }

  try {
    if (
      BigInt(
        quotePremium.amountBaseUnits
      ) <= 0n
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return quotePremium;
};

export class FinancialConstitutionEngine
  implements PolicyEngine {
  public async evaluatePolicy(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy,
    stage: PolicyEvaluationStage = "EXECUTION"
  ): Promise<PolicyDecisionRecord> {
    const checks: PolicyCheckItem[] = [];

    const isMultiLeg =
      candidate.legs.length > 1 ||
      candidate.strategyType ===
      "PUT_SPREAD";

    const quoteCost =
      getVerifiedCost(candidate);

    if (!quoteCost) {
      if (stage === "RFQ_SPECIFICATION") {
        checks.push({
          ruleId: "POL-001",
          description:
            "Transaction premium does not exceed user's confirmed maximum budget limit",
          status: "NOT_EVALUATED",
          details:
            "Budget evaluation pending RFQ market maker quotation pricing (unknown before quotes arrive)",
        });
      } else {
        checks.push({
          ruleId: "POL-001",
          description:
            "Transaction premium does not exceed user's confirmed maximum budget limit",
          status: "FAIL",
          details:
            "No verified preview pricing or quote premium available to evaluate budget limit",
        });
      }
    } else {
      const budgetSymbol =
        intent.maxPremiumUSDC.value.symbol.toUpperCase();

      const quoteSymbol =
        quoteCost.symbol.toUpperCase();

      if (
        quoteSymbol !== budgetSymbol
      ) {
        checks.push({
          ruleId: "POL-001",
          description:
            "Transaction premium denomination matches user's confirmed budget currency",
          status: "FAIL",
          details:
            `Denomination mismatch: Premium token symbol (${quoteCost.symbol}) does not match budget symbol (${intent.maxPremiumUSDC.value.symbol})`,
        });
      } else {
        const quoteDecimals =
          quoteCost.decimals;

        const budgetDecimals =
          intent.maxPremiumUSDC.value.decimals;

        const quoteAmount =
          BigInt(
            quoteCost.amountBaseUnits
          );

        const budgetAmount =
          BigInt(
            intent.maxPremiumUSDC.value
              .amountBaseUnits
          );

        const comparisonDecimals =
          Math.max(
            quoteDecimals,
            budgetDecimals
          );

        const normalizedQuote =
          quoteAmount *
          10n **
          BigInt(
            comparisonDecimals -
            quoteDecimals
          );

        const normalizedBudget =
          budgetAmount *
          10n **
          BigInt(
            comparisonDecimals -
            budgetDecimals
          );

        const isWithinBudget =
          normalizedQuote <=
          normalizedBudget;

        checks.push({
          ruleId: "POL-001",
          description:
            "Transaction premium does not exceed user's confirmed maximum budget limit",
          status: isWithinBudget
            ? "PASS"
            : "FAIL",
          details: isWithinBudget
            ? `Normalized premium (${normalizedQuote.toString()}) <= Normalized budget (${normalizedBudget.toString()})`
            : `Normalized premium (${normalizedQuote.toString()}) exceeds normalized budget (${normalizedBudget.toString()})`,
        });
      }
    }

    const intentAsset =
      normalizeAsset(
        intent.asset.value
      );

    const candidateAssetRaw =
      candidate.quotes[0]?.asset ||
      (candidate as any).underlying;

    if (!candidateAssetRaw) {
      checks.push({
        ruleId: "POL-002",
        description:
          "Candidate underlying matches the user's protected asset",
        status: "FAIL",
        details:
          "Candidate provides no underlying asset evidence.",
      });
    } else {
      const candidateAsset =
        normalizeAsset(
          candidateAssetRaw
        );

      const isAssetMatch =
        intentAsset ===
        candidateAsset;

      checks.push({
        ruleId: "POL-002",
        description:
          "Candidate underlying matches the user's protected asset",
        status: isAssetMatch
          ? "PASS"
          : "FAIL",
        details: isAssetMatch
          ? `Underlying matches confirmed asset ${intentAsset}.`
          : `Candidate underlying ${candidateAsset} does not match confirmed asset ${intentAsset}.`,
      });
    }

    const allowed =
      intent.allowedProtocols.value.map(
        (protocol) =>
          protocol.toUpperCase()
      );

    const candidateProtocol =
      candidate.quotes[0]?.protocol ||
      (candidate as any).protocol;

    if (!candidateProtocol) {
      checks.push({
        ruleId: "POL-003",
        description:
          "Candidate protocol is permitted by the confirmed intent",
        status: "FAIL",
        details:
          "Candidate provides no protocol provenance evidence.",
      });
    } else {
      const normalizedProtocol =
        candidateProtocol.toUpperCase();

      const isProtocolAllowed =
        allowed.includes(
          normalizedProtocol
        );

      checks.push({
        ruleId: "POL-003",
        description:
          "Candidate protocol is permitted by the confirmed intent",
        status: isProtocolAllowed
          ? "PASS"
          : "FAIL",
        details: isProtocolAllowed
          ? `Protocol ${normalizedProtocol} is allowed.`
          : `Protocol ${normalizedProtocol} is not in the confirmed protocol list.`,
      });
    }

    checks.push({
      ruleId: "POL-004",
      description:
        "Any financial execution requires a separate authorization boundary",
      status: "NOT_EVALUATED",
      details:
        stage === "RFQ_SPECIFICATION"
          ? "RFQ specification only; no RFQ or transaction has been submitted."
          : stage === "ANALYSIS"
            ? "Pre-execution analysis only; no signing or transaction submission is requested."
            : "Execution authorization has not been evaluated or granted.",
    });

    const isConfirmed =
      intent.confirmedByUser === true;

    checks.push({
      ruleId: "POL-005",
      description:
        "Candidate is bound to an explicitly confirmed Typed Risk Intent",
      status: isConfirmed
        ? "PASS"
        : "FAIL",
      details: isConfirmed
        ? `Intent ${intent.intentId} version ${intent.version} is explicitly confirmed.`
        : "Intent has not been explicitly confirmed by user",
    });

    const userHorizonMs =
      intent.horizonTimestamp.value.timestampMs;

    const candidateExpiryMs =
      candidate.legs[0]
        ?.expiryTimestampMs ||
      candidate.quotes[0]
        ?.expiryTimestampMs;

    if (!candidateExpiryMs) {
      checks.push({
        ruleId: "POL-006",
        description:
          "Option expiry covers the user's confirmed protection period",
        status: "FAIL",
        details:
          "Candidate provides no verified option expiry.",
      });
    } else {
      const isHorizonSufficient =
        candidateExpiryMs >=
        userHorizonMs;

      checks.push({
        ruleId: "POL-006",
        description:
          "Option expiry covers the user's confirmed protection period",
        status: isHorizonSufficient
          ? "PASS"
          : "FAIL",
        details: isHorizonSufficient
          ? `Option expiry ${new Date(
            candidateExpiryMs
          ).toISOString()} covers confirmed horizon ${new Date(
            userHorizonMs
          ).toISOString()}.`
          : `Option expires ${new Date(
            candidateExpiryMs
          ).toISOString()} before confirmed horizon ${new Date(
            userHorizonMs
          ).toISOString()}.`,
      });
    }

    if (isMultiLeg) {
      const userAllowedMultiLeg =
        intent.allowMultiLeg.value ===
        true;

      checks.push({
        ruleId: "POL-007",
        description:
          "Multi-leg option structures require explicit user permission",
        status:
          userAllowedMultiLeg
            ? "PASS"
            : "FAIL",
        details:
          userAllowedMultiLeg
            ? "User explicitly permits multi-leg protection structures."
            : "Candidate is multi-leg but the confirmed intent does not permit multi-leg structures.",
      });
    }

    const sizingResolved =
      candidate.sizingStatus ===
      "RESOLVED";

    if (!sizingResolved) {
      checks.push({
        ruleId: "POL-008",
        description:
          "Protection quantity is resolved and available market capacity is sufficient",
        status: "FAIL",
        details:
          "Option sizing is not resolved.",
      });
    } else if (
      stage === "RFQ_SPECIFICATION"
    ) {
      checks.push({
        ruleId: "POL-008",
        description:
          "Protection quantity is resolved and available market capacity is sufficient",
        status: "PASS",
        details:
          "Protection quantity is resolved for the RFQ specification; OptionBook liquidity is not applicable to this unsubmitted custom quote specification.",
      });
    } else if (
      candidate.liquiditySufficient ===
      true
    ) {
      checks.push({
        ruleId: "POL-008",
        description:
          "Protection quantity is resolved and available market capacity is sufficient",
        status: "PASS",
        details:
          "Option sizing is resolved and verified market capacity is sufficient.",
      });
    } else if (
      candidate.liquiditySufficient ===
      false
    ) {
      checks.push({
        ruleId: "POL-008",
        description:
          "Protection quantity is resolved and available market capacity is sufficient",
        status: "FAIL",
        details:
          "Verified market capacity is insufficient for the requested protection quantity.",
      });
    } else {
      checks.push({
        ruleId: "POL-008",
        description:
          "Protection quantity is resolved and available market capacity is sufficient",
        status: "NOT_EVALUATED",
        details:
          "Market capacity has not been verified.",
      });
    }

    if (
      candidate.payoffSummary &&
      "effectiveDownsidePercent" in
      candidate.payoffSummary
    ) {
      const effectiveDownside =
        candidate.payoffSummary
          .effectiveDownsidePercent;

      const targetLoss =
        intent.targetMaxLossPercent.value;

      const targetMet =
        effectiveDownside <= targetLoss;

      checks.push({
        ruleId: "POL-009",
        description:
          "Modeled at-expiry downside does not exceed the user's confirmed target",
        status: targetMet
          ? "PASS"
          : "FAIL",
        details: targetMet
          ? `Modeled downside ${effectiveDownside}% is within confirmed target ${targetLoss}%.`
          : `Modeled downside ${effectiveDownside}% exceeds confirmed target ${targetLoss}%.`,
      });
    } else {
      checks.push({
        ruleId: "POL-009",
        description:
          "Modeled at-expiry downside does not exceed the user's confirmed target",
        status: "NOT_EVALUATED",
        details:
          stage === "RFQ_SPECIFICATION"
            ? "Modeled downside cannot be evaluated before RFQ pricing is available."
            : "Verified payoff evidence is unavailable, so the confirmed downside target cannot be evaluated.",
      });
    }

    const hasFail =
      checks.some(
        (check) =>
          check.status === "FAIL"
      );

    let overallStatus:
      PolicyDecisionStatus;

    let passedAllInvariants =
      false;

    if (hasFail) {
      overallStatus = "FAIL";
    } else if (
      stage === "ANALYSIS"
    ) {
      const analysisChecks =
        checks.filter(
          (check) =>
            check.ruleId !==
            "POL-004"
        );

      const allAnalysisPass =
        analysisChecks.every(
          (check) =>
            check.status === "PASS"
        );

      overallStatus =
        allAnalysisPass
          ? "PASS"
          : "INCOMPLETE";

      passedAllInvariants =
        allAnalysisPass;
    } else if (
      stage === "RFQ_SPECIFICATION"
    ) {
      overallStatus =
        "INCOMPLETE";
    } else {
      const hasNotEvaluated =
        checks.some(
          (check) =>
            check.status ===
            "NOT_EVALUATED"
        );

      if (hasNotEvaluated) {
        overallStatus =
          "INCOMPLETE";
      } else {
        overallStatus = "PASS";
        passedAllInvariants =
          true;
      }
    }

    return {
      decisionId: `decision-${Math.random()
        .toString(36)
        .substring(2, 9)}`,
      intentId: intent.intentId,
      strategyId:
        candidate.strategyId,
      overallStatus,
      passedAllInvariants,
      stage,
      checks,
      timestampMs: Date.now(),
    };
  }
}