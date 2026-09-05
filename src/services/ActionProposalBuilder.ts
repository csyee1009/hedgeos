import {
  ActionProposal,
  CandidateStrategy,
  FeeStatus,
  RFQSpecification,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { sha256Digest } from "../utils/canonicalDigest";
import { ThetanutsMarketService } from "./ThetanutsMarketService";

export interface OptionBookProposalBinding {
  candidateDigest?: string;
  marketSnapshotId?: string;
  marketSnapshotDigest?: string;
}

export class ActionProposalBuilder {
  /**
   * Deterministic digest over financially and execution-material
   * proposal semantics.
   *
   * Random proposal IDs and timestamps are intentionally excluded.
   */
  public static computeProposalDigest(params: {
    intentId: string;
    intentVersion: number;
    strategyId: string;
    protocol: string;
    chainId: number;
    actionType: string;
    targetContract: string;
    asset: string;
    optionRight: string;
    strikeBaseUnits: string;
    strikeDecimals?: number;
    expiryTimestampMs: number;
    quantityBaseUnits: string;
    quantityDecimals?: number;
    expectedTotalCostBaseUnits?: string;
    expectedTotalCostDecimals?: number;
    boundQuoteId?: string;
    orderIndex?: number;
    makerAddress?: string;
    feeStatus?: string;
    buyerSpendStatus?: string;
    orderSemanticDigest?: string;
    boundCandidateDigest?: string;
    boundMarketSnapshotId?: string;
    boundMarketSnapshotDigest?: string;
  }): string {
    return sha256Digest({
      intentId: params.intentId,
      intentVersion: params.intentVersion,
      strategyId: params.strategyId,

      protocol: params.protocol,
      chainId: params.chainId,
      actionType: params.actionType,

      targetContract:
        this.normalizeAddressForDigest(
          params.targetContract
        ),

      asset:
        String(
          params.asset || "UNRESOLVED"
        ).toUpperCase(),

      optionRight:
        String(
          params.optionRight ||
          "UNRESOLVED"
        ).toUpperCase(),

      strike: {
        amountBaseUnits:
          params.strikeBaseUnits ||
          "0",
        decimals:
          params.strikeDecimals ?? 8,
      },

      expiryTimestampMs:
        params.expiryTimestampMs || 0,

      quantity: {
        amountBaseUnits:
          params.quantityBaseUnits ||
          "0",
        decimals:
          params.quantityDecimals,
      },

      expectedTotalCost:
        params
          .expectedTotalCostBaseUnits !==
          undefined
          ? {
            amountBaseUnits:
              params.expectedTotalCostBaseUnits,
            decimals:
              params.expectedTotalCostDecimals,
          }
          : "UNPRICED",

      boundQuoteId:
        params.boundQuoteId ||
        "NONE",

      orderIndex:
        params.orderIndex ??
        "NONE",

      makerAddress:
        params.makerAddress
          ? params.makerAddress.toLowerCase()
          : "NONE",

      feeStatus:
        params.feeStatus ||
        "NOT_AVAILABLE",

      buyerSpendStatus:
        params.buyerSpendStatus ||
        "NOT_AVAILABLE",

      orderSemanticDigest:
        params.orderSemanticDigest ||
        "NO_ORDER_SEMANTICS",

      boundCandidateDigest:
        params.boundCandidateDigest ||
        "NONE",

      boundMarketSnapshotId:
        params.boundMarketSnapshotId ||
        "NONE",

      boundMarketSnapshotDigest:
        params
          .boundMarketSnapshotDigest ||
        "NONE",
    });
  }

  /**
   * Builds a proposal from one CandidateStrategy.
   *
   * The optional `binding` argument is used by Simple Discovery
   * when a particular discovery candidate and market snapshot have
   * been selected.
   */
  public static buildOptionBookProposal(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy,
    marketService?: ThetanutsMarketService,
    binding?: OptionBookProposalBinding
  ): ActionProposal {
    if (!intent.confirmedByUser) {
      throw new Error(
        "Cannot build action proposal: intent has not been explicitly confirmed by the user."
      );
    }

    if (
      candidate.strategyType !==
      "LONG_PUT"
    ) {
      throw new Error(
        "Cannot build action proposal: only LONG_PUT is supported by the current exact OptionBook execution path."
      );
    }

    /*
     * The currently supported executable strategy is one
     * single-strike long PUT. Do not silently choose among several
     * unrelated quotes or legs.
     */
    if (
      candidate.quotes.length !== 1 ||
      candidate.legs.length !== 1
    ) {
      throw new Error(
        "Cannot build action proposal: exact LONG_PUT proposal requires exactly one quote and one leg."
      );
    }

    const quote =
      candidate.quotes[0];

    const leg =
      candidate.legs[0];

    const nowMs =
      Date.now();

    if (!quote || !leg) {
      throw new Error(
        "Cannot build action proposal: candidate has no executable leg or quote."
      );
    }

    /* ============================================================
     * VERIFIED MARKET SEMANTICS
     * ============================================================ */

    if (
      quote.protocol !==
      "THETANUTS" ||
      quote.sourceType !==
      "OPTION_BOOK"
    ) {
      throw new Error(
        "Cannot build action proposal: quote is not a Thetanuts OptionBook quote."
      );
    }

    if (
      !quote.asset ||
      quote.optionRight !==
      "PUT"
    ) {
      throw new Error(
        "Cannot build action proposal: quote must explicitly identify a PUT and an underlying asset."
      );
    }

    if (
      quote.executableNow !== true
    ) {
      throw new Error(
        "Cannot build action proposal: quote is not currently executable."
      );
    }

    if (
      quote.eligibilityEvidence
        ?.status !==
      "ELIGIBLE_LONG_PUT"
    ) {
      throw new Error(
        "Cannot build action proposal: quote has not passed the protective long-put eligibility gate."
      );
    }

    if (
      quote.makerIsSeller !== true
    ) {
      throw new Error(
        "Cannot build action proposal: signed order does not prove maker-sells/taker-buys direction."
      );
    }

    if (
      quote.normalizedOptionType &&
      quote.normalizedOptionType !==
      "PUT"
    ) {
      throw new Error(
        "Cannot build action proposal: normalized order evidence is not a PUT."
      );
    }

    if (
      !quote.allStrikes ||
      quote.allStrikes.length !== 1
    ) {
      throw new Error(
        "Cannot build action proposal: current LONG_PUT path requires exactly one observed strike."
      );
    }

    if (
      leg.right !== "PUT" ||
      leg.side !== "BUY"
    ) {
      throw new Error(
        "Cannot build action proposal: candidate leg must be BUY PUT."
      );
    }

    /* ============================================================
     * EXACT SIZING
     * ============================================================ */

    if (
      leg.sizingStatus !==
      "RESOLVED" ||
      !leg.resolvedOptionQuantity
    ) {
      throw new Error(
        "Cannot build action proposal: exact resolved option quantity is required."
      );
    }

    if (
      leg.expiryTimestampMs !==
      quote.expiryTimestampMs
    ) {
      throw new Error(
        "Cannot build action proposal: leg expiry differs from quote expiry."
      );
    }

    this.assertTokenAmountEquals(
      leg.strikePrice,
      quote.strikePrice,
      "Cannot build action proposal: leg strike differs from quote strike."
    );

    /* ============================================================
     * CANONICAL OPTIONBOOK TARGET
     * ============================================================ */

    const targetContract =
      marketService
        ? marketService.getOptionBookAddress()
        : "";

    if (!targetContract) {
      throw new Error(
        "Cannot build action proposal: canonical Thetanuts OptionBook address is unavailable."
      );
    }

    /* ============================================================
     * VERIFIED COST / FEE EVIDENCE
     * ============================================================ */

    let expectedPremium:
      TokenAmount | undefined;

    let expectedFees:
      TokenAmount | undefined;

    let expectedTotalCost:
      TokenAmount | undefined;

    let feeStatus:
      FeeStatus =
      "NOT_AVAILABLE";

    let buyerSpendStatus:
      ActionProposal["buyerSpendStatus"] =
      "NOT_AVAILABLE";

    if (
      candidate.preview
        ?.previewStatus ===
      "PREVIEW_AVAILABLE"
    ) {
      expectedPremium =
        candidate.preview
          .premiumAmount;

      expectedTotalCost =
        candidate.preview
          .totalExpectedCost;

      feeStatus =
        candidate.preview
          .feeStatus;

      buyerSpendStatus =
        candidate.preview
          .buyerSpendStatus ||
        "NOT_AVAILABLE";

      /*
       * VERIFIED does not mean "zero fee".
       *
       * When feeStatus is VERIFIED, use the actual explicitly
       * evidenced fee components.
       */
      if (
        feeStatus === "VERIFIED"
      ) {
        expectedFees =
          this.sumTokenAmounts(
            candidate.preview
              .protocolFee,
            candidate.preview
              .referrerFee,
            "USDC"
          );
      } else {
        /*
         * INCOMPLETE / NOT_AVAILABLE:
         * do not fabricate a fee total.
         */
        expectedFees =
          undefined;
      }
    }

    const isComplete =
      Boolean(
        expectedTotalCost &&
        buyerSpendStatus ===
        "VERIFIED"
      );

    /* ============================================================
     * SIGNED ORDER IDENTITY
     * ============================================================ */

    const orderSemanticDigest =
      marketService
        ? marketService.getOrderIdentityDigest(
          quote
        )
        : "";

    if (
      marketService &&
      !orderSemanticDigest
    ) {
      throw new Error(
        "Cannot build action proposal: signed OptionBook order identity cannot be established."
      );
    }

    /* ============================================================
     * DISCOVERY BINDING
     * ============================================================ */

    const boundCandidateDigest =
      binding?.candidateDigest ??
      (candidate as any)
        .candidateDigest;

    const boundMarketSnapshotId =
      binding?.marketSnapshotId ??
      (candidate as any)
        .marketSnapshotId;

    const boundMarketSnapshotDigest =
      binding
        ?.marketSnapshotDigest ??
      (candidate as any)
        .marketSnapshotDigest;

    /*
     * These are optional here because Advanced Mode can still build
     * directly from a solver CandidateStrategy.
     *
     * Simple Mode server wiring will provide all three after a user
     * selects a DiscoveryCandidate.
     */

    const digest =
      this.computeProposalDigest({
        intentId:
          intent.intentId,

        intentVersion:
          intent.version,

        strategyId:
          candidate.strategyId,

        protocol:
          "THETANUTS",

        chainId: 8453,

        actionType:
          "OPTIONBOOK_FILL_ORDER",

        targetContract,

        asset:
          quote.asset,

        optionRight:
          quote.optionRight,

        strikeBaseUnits:
          quote.strikePrice
            .amountBaseUnits,

        strikeDecimals:
          quote.strikePrice.decimals,

        expiryTimestampMs:
          quote.expiryTimestampMs,

        quantityBaseUnits:
          leg.resolvedOptionQuantity
            .amountBaseUnits,

        quantityDecimals:
          leg.resolvedOptionQuantity
            .decimals,

        expectedTotalCostBaseUnits:
          expectedTotalCost
            ?.amountBaseUnits,

        expectedTotalCostDecimals:
          expectedTotalCost
            ?.decimals,

        boundQuoteId:
          quote.quoteId,

        orderIndex:
          quote.orderIndex,

        makerAddress:
          quote.makerAddress,

        feeStatus,

        buyerSpendStatus,

        orderSemanticDigest,

        boundCandidateDigest,

        boundMarketSnapshotId,

        boundMarketSnapshotDigest,
      });

    return {
      proposalId:
        `prop-${digest.slice(
          0,
          20
        )}`,

      intentId:
        intent.intentId,

      intentVersion:
        intent.version,

      strategyId:
        candidate.strategyId,

      protocol:
        "THETANUTS",

      chainId: 8453,

      actionType:
        "OPTIONBOOK_FILL_ORDER",

      targetContract,

      normalizedParameters: {
        strategyType:
          candidate.strategyType,

        quoteId:
          quote.quoteId,

        orderIndex:
          quote.orderIndex,

        makerAddress:
          quote.makerAddress,

        optionRight:
          quote.optionRight,

        strike:
          quote.strikePrice,

        expiry:
          quote.expiryTimestampMs,

        contracts:
          leg.resolvedOptionQuantity,

        pricePerContractUSD:
          candidate.preview
            ?.pricePerContract,

        allStrikes:
          quote.allStrikes,

        implementationAddress:
          quote.implementationAddress,

        implementationName:
          quote.implementationName,

        makerIsSeller:
          quote.makerIsSeller,

        rawOrderIsLong:
          quote.rawOrderIsLong,

        normalizedOptionType:
          quote.normalizedOptionType,

        rawOptionType:
          quote.rawOptionType,

        orderValidityDeadlineMs:
          quote.orderValidityDeadlineMs,

        eligibilityEvidence:
          quote.eligibilityEvidence,

        orderSemanticDigest,

        buyerSpendVerificationMode:
          candidate.preview
            ?.buyerSpendVerificationMode,

        boundCandidateDigest,

        boundMarketSnapshotId,

        boundMarketSnapshotDigest,
      },

      expectedAsset:
        quote.asset,

      expectedOptionRight:
        "PUT",

      expectedStrike:
        quote.strikePrice,

      expectedQuantity:
        leg.resolvedOptionQuantity,

      expectedPremium,

      expectedFees,

      expectedTotalCost,

      feeStatus,

      buyerSpendStatus,

      expectedExpiryMs:
        quote.expiryTimestampMs,

      boundQuoteId:
        quote.quoteId,

      boundCandidateDigest,

      boundMarketSnapshotId,

      boundMarketSnapshotDigest,

      proposalCreatedAtMs:
        nowMs,

      proposalStatus:
        isComplete
          ? "PREPARED"
          : "INCOMPLETE",

      /*
       * Preview evidence is not the same thing as exact calldata.
       */
      bindingStatus:
        "PREVIEW_BOUND",

      proposalDigest:
        digest,

      authorizationStatus:
        "UNAUTHORIZED",
    };
  }

  /**
   * Builds an unsubmitted RFQ proposal.
   *
   * This is specification evidence only. It does not claim that a
   * custom quote has been requested, priced, authorized, or sent.
   */
  public static buildRFQProposal(
    intent: TypedRiskIntent,
    rfqSpec: RFQSpecification,
    marketService?: ThetanutsMarketService
  ): ActionProposal {
    if (!intent.confirmedByUser) {
      throw new Error(
        "Cannot build RFQ proposal: intent has not been explicitly confirmed by the user."
      );
    }

    const nowMs =
      Date.now();

    const primaryStrike =
      rfqSpec.strikes[0];

    if (!primaryStrike) {
      throw new Error(
        "Cannot build RFQ proposal: RFQ specification has no strike evidence."
      );
    }

    const targetContract =
      marketService
        ? marketService.getOptionFactoryAddress()
        : "";

    if (!targetContract) {
      throw new Error(
        "Cannot build RFQ proposal: canonical Thetanuts OptionFactory address is unavailable."
      );
    }

    const digest =
      this.computeProposalDigest({
        intentId:
          intent.intentId,

        intentVersion:
          intent.version,

        strategyId:
          `rfq-${rfqSpec.rfqSpecId}`,

        protocol:
          "THETANUTS",

        chainId: 8453,

        actionType:
          "REQUEST_FOR_QUOTATION",

        targetContract,

        asset:
          rfqSpec.underlying,

        optionRight:
          rfqSpec.optionRight,

        strikeBaseUnits:
          primaryStrike
            .amountBaseUnits,

        strikeDecimals:
          primaryStrike.decimals,

        expiryTimestampMs:
          rfqSpec.expiryTimestampMs,

        quantityBaseUnits:
          rfqSpec
            .requestedContracts
            .amountBaseUnits,

        quantityDecimals:
          rfqSpec
            .requestedContracts
            .decimals,

        expectedTotalCostBaseUnits:
          undefined,

        boundQuoteId:
          rfqSpec.rfqSpecId,

        feeStatus:
          "NOT_AVAILABLE",

        buyerSpendStatus:
          "NOT_AVAILABLE",
      });

    return {
      proposalId:
        `prop-rfq-${digest.slice(
          0,
          20
        )}`,

      intentId:
        intent.intentId,

      intentVersion:
        intent.version,

      strategyId:
        `rfq-${rfqSpec.rfqSpecId}`,

      protocol:
        "THETANUTS",

      chainId: 8453,

      actionType:
        "REQUEST_FOR_QUOTATION",

      targetContract,

      normalizedParameters: {
        rfqSpecId:
          rfqSpec.rfqSpecId,

        strategyType:
          rfqSpec.strategyType,

        underlying:
          rfqSpec.underlying,

        strikes:
          rfqSpec.strikes,

        expiryTimestampMs:
          rfqSpec.expiryTimestampMs,

        requestedContracts:
          rfqSpec.requestedContracts,

        offerDeadlineMinutes:
          rfqSpec.offerDeadlineMinutes,

        /*
         * Explicitly preserve the product's truthfulness boundary.
         */
        pricingStatus:
          rfqSpec.pricingStatus,

        lifecycleStatus:
          "SPECIFICATION_ONLY",
      },

      expectedAsset:
        rfqSpec.underlying,

      expectedOptionRight:
        rfqSpec.optionRight,

      expectedStrike:
        primaryStrike,

      expectedQuantity:
        rfqSpec.requestedContracts,

      expectedPremium:
        undefined,

      expectedFees:
        undefined,

      expectedTotalCost:
        undefined,

      feeStatus:
        "NOT_AVAILABLE",

      buyerSpendStatus:
        "NOT_AVAILABLE",

      expectedExpiryMs:
        rfqSpec.expiryTimestampMs,

      boundQuoteId:
        rfqSpec.rfqSpecId,

      proposalCreatedAtMs:
        nowMs,

      proposalStatus:
        rfqSpec.validationStatus ===
          "VALID"
          ? "PREPARED"
          : "INCOMPLETE",

      bindingStatus:
        "PREVIEW_BOUND",

      proposalDigest:
        digest,

      authorizationStatus:
        "UNAUTHORIZED",
    };
  }

  private static assertTokenAmountEquals(
    a: TokenAmount,
    b: TokenAmount,
    message: string
  ): void {
    const decimals =
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
        decimals -
        a.decimals
      );

    const amountB =
      BigInt(
        b.amountBaseUnits
      ) *
      10n **
      BigInt(
        decimals -
        b.decimals
      );

    if (amountA !== amountB) {
      throw new Error(message);
    }
  }

  private static sumTokenAmounts(
    a: TokenAmount,
    b: TokenAmount,
    symbol: string
  ): TokenAmount {
    const decimals =
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
        decimals -
        a.decimals
      );

    const amountB =
      BigInt(
        b.amountBaseUnits
      ) *
      10n **
      BigInt(
        decimals -
        b.decimals
      );

    return {
      amountBaseUnits:
        (
          amountA +
          amountB
        ).toString(),

      decimals,

      symbol,
    };
  }

  private static normalizeAddressForDigest(
    value: string
  ): string {
    return value
      ? value.toLowerCase()
      : "UNRESOLVED";
  }
}