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
import { ratioLessThanOrEqualPercent } from "./ExactFinancialMath";

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
      candidate.preview.buyerSpendStatus === "VERIFIED" ||
      candidate.preview.feeStatus === "VERIFIED"
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
      const targetLoss =
        intent.targetMaxLossPercent.value;
      const exact = candidate.payoffSummary.exact;
      const effectiveDownside = candidate.payoffSummary.effectiveDownsidePercent;
      const targetMet = exact
        ? ratioLessThanOrEqualPercent(
          BigInt(exact.maxLossValuePrice8),
          BigInt(exact.exposureValuePrice8),
          targetLoss
        )
        : false;

      checks.push({
        ruleId: "POL-009",
        description:
          "Modeled at-expiry downside does not exceed the user's confirmed target",
        status: targetMet
          ? "PASS"
          : "FAIL",
        details: targetMet
          ? `Exact modeled-at-expiry downside ratio is within confirmed target ${targetLoss}% (display ${effectiveDownside}%).`
          : exact
            ? `Exact modeled-at-expiry downside ratio exceeds confirmed target ${targetLoss}% (display ${effectiveDownside}%).`
            : "Exact modeled-at-expiry downside evidence is unavailable; display rounding cannot authorize a pass.",
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

    const quote = candidate.quotes[0];
    const isRfqSpecification = stage === "RFQ_SPECIFICATION";
    checks.push({
      ruleId: "POL-010",
      description: "Order direction makes the user/taker the option buyer",
      status: isRfqSpecification ? "NOT_EVALUATED" : quote?.makerIsSeller === true ? "PASS" : "FAIL",
      details: quote?.makerIsSeller === true
        ? "Signed-order evidence has isLong=true: maker sells and taker buys."
        : "Protective LONG_PUT direction was not proven from signed-order evidence.",
    });
    const structureEligible = quote?.allStrikes?.length === 1
      && quote.implementationName === "PUT"
      && quote.eligibilityEvidence?.status === "ELIGIBLE_LONG_PUT";
    checks.push({
      ruleId: "POL-011",
      description: "Order is an unambiguous single-leg vanilla put",
      status: isRfqSpecification ? "NOT_EVALUATED" : structureEligible ? "PASS" : "FAIL",
      details: structureEligible
        ? "Full strike array and SDK implementation metadata prove a one-strike vanilla PUT."
        : "Single-leg vanilla PUT structure is not fully evidenced.",
    });
    const nowMs = Date.now();
    const validityPass = quote?.executableNow === true
      && Boolean(quote.orderValidityDeadlineMs && quote.orderValidityDeadlineMs > nowMs)
      && Boolean(quote.expiryTimestampMs > nowMs);
    checks.push({
      ruleId: "POL-012",
      description: "Order deadline, option expiry, and executability are current",
      status: isRfqSpecification ? "NOT_EVALUATED" : validityPass ? "PASS" : "FAIL",
      details: validityPass
        ? "Order is executable now and both deadlines are in the future."
        : "Current executability and deadline evidence is incomplete or expired.",
    });
    const quantityMatches = candidate.preview?.rawPreviewData?.numContracts !== undefined
      && candidate.legs[0]?.resolvedOptionQuantity?.amountBaseUnits !== undefined
      && BigInt(candidate.preview.rawPreviewData.numContracts) * 1_000_000_000_000n
        === BigInt(candidate.legs[0].resolvedOptionQuantity.amountBaseUnits);
    checks.push({
      ruleId: "POL-013",
      description: "Requested and SDK-previewed option quantities are exactly equal",
      status: isRfqSpecification ? "NOT_EVALUATED" : quantityMatches ? "PASS" : "FAIL",
      details: quantityMatches
        ? "OptionBook 6-decimal contract quantity exactly equals the internal 18-decimal requested quantity."
        : "Exact requested-to-previewed quantity equality was not proven.",
    });

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
