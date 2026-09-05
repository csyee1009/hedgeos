import { ethers } from "ethers";
import {
  ActionProposal,
  DiscoveryCandidate,
  ExecutionPreparation,
  MarketQuote,
  MarketSnapshotEvidence,
  PolicyDecisionRecord,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { sha256Digest } from "../utils/canonicalDigest";
import { ActionProposalBuilder } from "./ActionProposalBuilder";
import { computeIntentDigest } from "./AuditReceiptService";
import {
  scaleExact,
  tokenAmountLessThanOrEqual,
} from "./ExactFinancialMath";
import { ThetanutsMarketService } from "./ThetanutsMarketService";

const OPTIONBOOK_CONTRACT_SCALE = 1_000_000_000_000n;
const MAX_PREPARATION_SNAPSHOT_AGE_MS = 60_000;

export class ExactExecutionPreparationService {
  constructor(
    private marketService: ThetanutsMarketService
  ) { }

  public async prepare(params: {
    intent: TypedRiskIntent;
    proposal: ActionProposal;
    quote: MarketQuote;
    candidate: DiscoveryCandidate;
    snapshot: MarketSnapshotEvidence;
    expectedBeneficiary: string;
    referrer?: string;

    /**
     * Exact preparation requires authoritative PASS policy evidence.
     * A digest supplied by the caller alone is not sufficient.
     */
    policyDecision: PolicyDecisionRecord;
  }): Promise<ExecutionPreparation> {
    const {
      intent,
      proposal,
      quote,
      candidate,
      snapshot,
      policyDecision,
    } = params;

    /* ============================================================
     * 1. CONFIRMED INTENT
     * ============================================================ */

    if (!intent.confirmedByUser) {
      throw new Error(
        "A confirmed Typed Risk Intent is required"
      );
    }

    if (
      !intent.confirmedAtMs ||
      intent.confirmedAtMs <= 0
    ) {
      throw new Error(
        "Confirmed intent timestamp is required"
      );
    }

    /* ============================================================
     * 2. PROPOSAL ↔ INTENT BINDING
     * ============================================================ */

    if (
      proposal.intentId !==
      intent.intentId ||
      proposal.intentVersion !==
      intent.version
    ) {
      throw new Error(
        "Proposal is stale for the confirmed intent version"
      );
    }

    if (
      proposal.protocol !==
      "THETANUTS" ||
      proposal.chainId !== 8453 ||
      proposal.actionType !==
      "OPTIONBOOK_FILL_ORDER"
    ) {
      throw new Error(
        "Proposal is not a supported Thetanuts OptionBook fill"
      );
    }

    if (
      proposal.authorizationStatus !==
      "UNAUTHORIZED"
    ) {
      throw new Error(
        "Proposal authority state is invalid"
      );
    }

    if (
      !proposal.proposalDigest ||
      proposal.proposalDigest.trim()
        .length === 0
    ) {
      throw new Error(
        "Proposal digest is required"
      );
    }

    const recomputedProposalDigest =
      ActionProposalBuilder.computeProposalDigest({
        intentId: proposal.intentId,
        intentVersion: proposal.intentVersion,
        strategyId: proposal.strategyId,
        protocol: proposal.protocol,
        chainId: proposal.chainId,
        actionType: proposal.actionType,
        targetContract: proposal.targetContract,
        asset: proposal.expectedAsset,
        optionRight: proposal.expectedOptionRight,
        strikeBaseUnits:
          proposal.expectedStrike.amountBaseUnits,
        strikeDecimals:
          proposal.expectedStrike.decimals,
        expiryTimestampMs:
          proposal.expectedExpiryMs,
        quantityBaseUnits:
          proposal.expectedQuantity.amountBaseUnits,
        quantityDecimals:
          proposal.expectedQuantity.decimals,
        expectedTotalCostBaseUnits:
          proposal.expectedTotalCost?.amountBaseUnits,
        expectedTotalCostDecimals:
          proposal.expectedTotalCost?.decimals,
        boundQuoteId:
          proposal.boundQuoteId,
        orderIndex:
          proposal.normalizedParameters?.orderIndex,
        makerAddress:
          proposal.normalizedParameters?.makerAddress,
        feeStatus:
          proposal.feeStatus,
        buyerSpendStatus:
          proposal.buyerSpendStatus,
        orderSemanticDigest:
          proposal.normalizedParameters?.orderSemanticDigest,
        boundCandidateDigest:
          proposal.boundCandidateDigest,
        boundMarketSnapshotId:
          proposal.boundMarketSnapshotId,
        boundMarketSnapshotDigest:
          proposal.boundMarketSnapshotDigest,
      });

    if (
      recomputedProposalDigest !==
      proposal.proposalDigest
    ) {
      throw new Error(
        "Proposal digest does not match proposal contents"
      );
    }

    /* ============================================================
     * 3. AUTHORITATIVE POLICY PASS
     * ============================================================ */

    this.assertPolicyPass(
      policyDecision,
      intent,
      proposal
    );

    const policyDecisionDigest =
      sha256Digest(policyDecision);

    /* ============================================================
     * 4. SNAPSHOT INTEGRITY + FRESHNESS
     * ============================================================ */

    if (
      snapshot.status !==
      "LIVE_READ_AVAILABLE"
    ) {
      throw new Error(
        "Fresh live market evidence is required for exact preparation"
      );
    }

    const snapshotAgeMs =
      Date.now() -
      snapshot.capturedAtMs;

    if (
      snapshotAgeMs < 0 ||
      snapshotAgeMs >
      MAX_PREPARATION_SNAPSHOT_AGE_MS
    ) {
      throw new Error(
        "Market snapshot is stale for exact preparation"
      );
    }

    const {
      snapshotDigest:
      _snapshotDigest,
      ...snapshotWithoutDigest
    } = snapshot;

    const recomputedSnapshotDigest =
      sha256Digest(
        snapshotWithoutDigest
      );

    if (
      recomputedSnapshotDigest !==
      snapshot.snapshotDigest
    ) {
      throw new Error(
        "Market snapshot digest does not match snapshot contents"
      );
    }

    /* ============================================================
     * 5. CANDIDATE ↔ SNAPSHOT BINDING
     * ============================================================ */

    if (
      candidate.marketSnapshotId !==
      snapshot.snapshotId
    ) {
      throw new Error(
        "Selected candidate belongs to a different market snapshot"
      );
    }

    if (
      candidate.marketSnapshotDigest !==
      snapshot.snapshotDigest
    ) {
      throw new Error(
        "Selected candidate snapshot digest does not match current snapshot"
      );
    }

    if (
      candidate.strategyType !==
      "LONG_PUT"
    ) {
      throw new Error(
        "Only LONG_PUT discovery candidates are supported for exact execution"
      );
    }

    if (
      candidate.asset
        .toUpperCase() !==
      intent.asset.value
        .toUpperCase()
    ) {
      throw new Error(
        "Candidate asset does not match the confirmed intent"
      );
    }

    /* ============================================================
     * 6. CANDIDATE ↔ QUOTE ↔ SNAPSHOT
     * ============================================================ */

    if (
      candidate.quoteId !==
      quote.quoteId
    ) {
      throw new Error(
        "Selected candidate is not bound to the supplied quote"
      );
    }

    const snapshotQuote =
      snapshot.quotes.find(
        (item) =>
          item.quoteId ===
          candidate.quoteId
      );

    if (!snapshotQuote) {
      throw new Error(
        "Selected quote does not exist in the bound market snapshot"
      );
    }

    const suppliedOrderIdentity =
      this.marketService.getOrderIdentityDigest(
        quote
      );

    const snapshotOrderIdentity =
      this.marketService.getOrderIdentityDigest(
        snapshotQuote
      );

    if (
      !suppliedOrderIdentity ||
      !snapshotOrderIdentity ||
      suppliedOrderIdentity !==
      snapshotOrderIdentity
    ) {
      throw new Error(
        "Supplied quote does not match the signed order contained in the market snapshot"
      );
    }

    if (
      quote.optionRight !== "PUT" ||
      quote.normalizedOptionType !==
      "PUT" ||
      quote.makerIsSeller !== true ||
      quote.executableNow !== true ||
      quote.eligibilityEvidence
        ?.status !==
      "ELIGIBLE_LONG_PUT"
    ) {
      throw new Error(
        "Selected order no longer has verified protective long-put semantics"
      );
    }

    if (
      !quote.allStrikes ||
      quote.allStrikes.length !== 1
    ) {
      throw new Error(
        "Exact preparation requires a verified single-strike PUT"
      );
    }

    /* ============================================================
     * 7. RECOMPUTE CANDIDATE DIGEST
     *
     * Never blindly trust candidate.candidateDigest.
     * ============================================================ */

    const quantity18 =
      scaleExact(
        BigInt(
          candidate.quantity
            .amountBaseUnits
        ),
        candidate.quantity.decimals,
        18
      );

    if (
      quantity18 <= 0n ||
      quantity18 %
      OPTIONBOOK_CONTRACT_SCALE !==
      0n
    ) {
      throw new Error(
        "Candidate quantity is not exactly representable in OptionBook contract precision"
      );
    }

    if (!snapshot.spotPrice) {
      throw new Error(
        "Snapshot spot-price evidence is required"
      );
    }

    const candidateSpend6 =
      scaleExact(
        BigInt(
          candidate
            .verifiedBuyerSpend
            .amountBaseUnits
        ),
        candidate
          .verifiedBuyerSpend
          .decimals,
        6
      );

    const strikePrice8 =
      scaleExact(
        BigInt(
          candidate.strike
            .amountBaseUnits
        ),
        candidate.strike.decimals,
        8
      );

    const spotPrice8 =
      scaleExact(
        BigInt(
          snapshot.spotPrice
            .amountBaseUnits
        ),
        snapshot.spotPrice
          .decimals,
        8
      );

    const candidateDigestPayload = {
      snapshotId:
        snapshot.snapshotId,

      snapshotDigest:
        snapshot.snapshotDigest,

      quoteId:
        quote.quoteId,

      strategyType:
        "LONG_PUT",

      asset:
        candidate.asset,

      quantity18:
        quantity18.toString(),

      spendUSDC6:
        candidateSpend6.toString(),

      maxLossValuePrice8:
        candidate
          .modeledAtExpiryDownside
          .maxLossValuePrice8,

      exposureValuePrice8:
        candidate
          .modeledAtExpiryDownside
          .exposureValuePrice8,

      strikePrice8:
        strikePrice8.toString(),

      spotPrice8:
        spotPrice8.toString(),

      expiryTimestampMs:
        quote.expiryTimestampMs,

      allStrikes:
        quote.allStrikes.map(
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

    const recomputedCandidateDigest =
      sha256Digest(
        candidateDigestPayload
      );

    if (
      recomputedCandidateDigest !==
      candidate.candidateDigest
    ) {
      throw new Error(
        "Candidate digest does not match candidate and market evidence"
      );
    }

    /* ============================================================
     * 8. PROPOSAL ↔ SELECTED CANDIDATE BINDING
     *
     * This specifically prevents:
     * selected candidate B + proposal generated for candidate A.
     * ============================================================ */

    if (
      !proposal.boundQuoteId ||
      proposal.boundQuoteId !==
      candidate.quoteId
    ) {
      throw new Error(
        "Proposal is not bound to the selected candidate quote"
      );
    }

    if (
      proposal.boundCandidateDigest &&
      proposal.boundCandidateDigest !==
      candidate.candidateDigest
    ) {
      throw new Error(
        "Proposal candidate digest does not match the selected candidate"
      );
    }

    if (
      proposal
        .boundMarketSnapshotId &&
      proposal
        .boundMarketSnapshotId !==
      snapshot.snapshotId
    ) {
      throw new Error(
        "Proposal market snapshot ID does not match selected market evidence"
      );
    }

    if (
      proposal
        .boundMarketSnapshotDigest &&
      proposal
        .boundMarketSnapshotDigest !==
      snapshot.snapshotDigest
    ) {
      throw new Error(
        "Proposal market snapshot digest does not match selected market evidence"
      );
    }

    this.assertTokenAmountEquals(
      proposal.expectedStrike,
      candidate.strike,
      "Proposal strike does not match selected candidate"
    );

    this.assertTokenAmountEquals(
      proposal.expectedQuantity,
      candidate.quantity,
      "Proposal quantity does not match selected candidate"
    );

    if (
      proposal.expectedExpiryMs !==
      candidate.expiryTimestampMs
    ) {
      throw new Error(
        "Proposal expiry does not match selected candidate"
      );
    }

    if (
      proposal.expectedAsset
        .toUpperCase() !==
      candidate.asset.toUpperCase()
    ) {
      throw new Error(
        "Proposal asset does not match selected candidate"
      );
    }

    if (
      proposal.expectedOptionRight !==
      "PUT"
    ) {
      throw new Error(
        "Proposal does not describe PUT protection"
      );
    }

    if (
      proposal.expectedTotalCost
    ) {
      const proposalSpend6 =
        scaleExact(
          BigInt(
            proposal
              .expectedTotalCost
              .amountBaseUnits
          ),
          proposal
            .expectedTotalCost
            .decimals,
          6
        );

      if (
        proposalSpend6 !==
        candidateSpend6
      ) {
        throw new Error(
          "Proposal buyer spend does not match selected candidate"
        );
      }
    }

    /* ============================================================
     * 9. BENEFICIARY / EXTERNAL EXECUTOR
     * ============================================================ */

    if (
      !ethers.isAddress(
        params.expectedBeneficiary
      )
    ) {
      throw new Error(
        "Expected beneficiary must be a valid external wallet address"
      );
    }

    const beneficiary =
      ethers.getAddress(
        params.expectedBeneficiary
      );

    const referrer =
      params.referrer
        ? ethers.getAddress(
          params.referrer
        )
        : ethers.ZeroAddress;

    /* ============================================================
     * 10. EXACT SDK FILL CONSTRUCTION
     * ============================================================ */

    const encoded =
      await this.marketService.encodeExactFill(
        quote,
        quantity18,
        referrer
      );

    const exactSpend: TokenAmount =
    {
      amountBaseUnits:
        encoded.buyerSpendUSDC6.toString(),
      decimals: 6,
      symbol: "USDC",
    };

    if (
      encoded.preview
        .buyerSpendStatus !==
      "VERIFIED"
    ) {
      throw new Error(
        "Exact buyer spend is not verified"
      );
    }

    if (
      encoded.buyerSpendUSDC6 !==
      candidateSpend6
    ) {
      throw new Error(
        "Exact SDK buyer spend differs from selected candidate evidence"
      );
    }

    if (
      !tokenAmountLessThanOrEqual(
        exactSpend,
        intent.maxPremiumUSDC.value
      )
    ) {
      throw new Error(
        "Exact buyer spend exceeds the confirmed maximum budget"
      );
    }

    /* ============================================================
     * 11. VERIFY ACTUAL SIGNED ORDER SEMANTICS
     *
     * Do NOT manufacture:
     *   isLong: true
     *   isCall: false
     *
     * First prove them from the signed order.
     * ============================================================ */

    const order =
      encoded.rawOrder?.order;

    const raw =
      encoded.rawOrder
        ?.rawApiData;

    if (!order || !raw) {
      throw new Error(
        "Original signed OptionBook order evidence is incomplete"
      );
    }

    if (raw.isLong !== true) {
      throw new Error(
        "Signed order direction does not prove maker-sells/taker-buys protection"
      );
    }

    if (
      !this.isPutOrder(
        raw,
        order
      )
    ) {
      throw new Error(
        "Signed order does not prove PUT semantics"
      );
    }

    const rawStrikes =
      Array.isArray(raw.strikes)
        ? raw.strikes.map(
          (value: unknown) =>
            String(value)
        )
        : Array.isArray(
          order.strikes
        )
          ? order.strikes.map(
            (value: unknown) =>
              String(value)
          )
          : [];

    if (
      rawStrikes.length !== 1
    ) {
      throw new Error(
        "Signed order is not a single-strike vanilla PUT"
      );
    }

    if (
      rawStrikes[0] !==
      String(
        quote.strikePrice
          .amountBaseUnits
      )
    ) {
      throw new Error(
        "Signed order strike differs from selected quote"
      );
    }

    /* ============================================================
     * 12. NONCE EVIDENCE
     * ============================================================ */

    const orderNonce =
      this.requiredString(
        order.nonce,
        "order nonce"
      );

    const computedNonce =
      this.marketService.computeOptionBookNonce(
        encoded.rawOrder
      );

    if (
      computedNonce !== null &&
      computedNonce !== orderNonce
    ) {
      throw new Error(
        "SDK-computed OptionBook nonce differs from signed-order nonce"
      );
    }

    const authoritativeNonce =
      computedNonce ??
      orderNonce;

    /* ============================================================
     * 13. CANONICAL PROTOCOL ADDRESSES
     * ============================================================ */

    const canonicalOptionBook =
      this.marketService.getOptionBookAddress();

    const canonicalOptionFactory =
      this.marketService.getOptionFactoryAddress();

    if (
      !ethers.isAddress(
        canonicalOptionBook
      )
    ) {
      throw new Error(
        "Canonical Thetanuts OptionBook address is unavailable"
      );
    }

    if (
      !ethers.isAddress(
        canonicalOptionFactory
      )
    ) {
      throw new Error(
        "Canonical Thetanuts OptionFactory address is unavailable"
      );
    }

    if (
      ethers.getAddress(
        encoded.to
      ) !==
      ethers.getAddress(
        canonicalOptionBook
      )
    ) {
      throw new Error(
        "Encoded target differs from canonical Thetanuts OptionBook"
      );
    }

    /* ============================================================
     * 14. EXACT ORDER FIELDS
     * ============================================================ */

    const implementation =
      this.requiredAddress(
        raw.implementation ??
        order.implementation,
        "implementation"
      );

    const priceFeed =
      this.requiredAddress(
        raw.priceFeed ??
        order.priceFeed,
        "price feed"
      );

    const collateral =
      this.requiredAddress(
        raw.collateral ??
        order.collateralToken,
        "collateral token"
      );

    const maker =
      this.requiredAddress(
        order.maker ??
        encoded.rawOrder
          .makerAddress,
        "maker"
      );

    const signature =
      this.requiredString(
        encoded.rawOrder
          .signature,
        "maker signature"
      );

    const expiry =
      this.requiredPositiveIntegerString(
        order.expiry ??
        raw.expiry,
        "option expiry"
      );

    const orderExpiryTimestamp =
      this.requiredPositiveIntegerString(
        raw.orderExpiryTimestamp ??
        order.orderExpiryTimestamp,
        "order validity deadline"
      );

    const price =
      this.requiredPositiveIntegerString(
        order.price,
        "order price"
      );

    const maxCollateralUsable =
      this.requiredIntegerString(
        raw.maxCollateralUsable ??
        order.maxCollateralUsable ??
        encoded.rawOrder
          .availableAmount,
        "maximum collateral usable"
      );

    const extraOptionData =
      String(
        raw.extraOptionData ??
        order.extraOptionData ??
        "0x"
      );

    const nowMs =
      Date.now();

    const validUntilMs =
      Math.min(
        Number(
          orderExpiryTimestamp
        ) * 1000,
        Number(expiry) * 1000
      );

    if (
      !Number.isFinite(
        validUntilMs
      ) ||
      validUntilMs <= nowMs
    ) {
      throw new Error(
        "Signed order is already expired"
      );
    }

    /* ============================================================
     * 15. SEMANTIC COMMITMENT
     * ============================================================ */

    const semanticOrder = {
      maker,

      signature,

      nonce:
        authoritativeNonce,

      /*
       * These are literals only AFTER the actual signed-order
       * evidence above has proven them.
       */
      isLong: true as const,

      implementation,

      strikes:
        rawStrikes,

      isCall: false as const,

      expiry,

      orderExpiryTimestamp,

      priceFeed,

      collateral,

      maxCollateralUsable,

      price,

      numContracts:
        encoded.numContracts6.toString(),

      numContractsDecimals:
        6 as const,

      expectedOptionQuantity18:
        quantity18.toString(),

      extraOptionData,
    };

    const semanticPayload = {
      chainId: 8453,

      to:
        ethers.getAddress(
          encoded.to
        ),

      action:
        "OPTIONBOOK_FILL_ORDER",

      expectedBeneficiary:
        beneficiary,

      expectedExecutor:
        beneficiary,

      referrer,

      canonicalOptionFactory:
        ethers.getAddress(
          canonicalOptionFactory
        ),

      maxTotalSpendUSDC:
        intent.maxPremiumUSDC.value,

      exactBuyerSpendUSDC:
        exactSpend,

      buyerSpendStatus:
        encoded.preview
          .buyerSpendStatus,

      buyerSpendVerificationMode:
        encoded.preview
          .buyerSpendVerificationMode,

      feeStatus:
        encoded.preview
          .feeStatus,

      order:
        semanticOrder,
    };

    const semanticDigest =
      sha256Digest(
        semanticPayload
      );

    const calldataHash =
      ethers.keccak256(
        encoded.data
      );

    const transaction = {
      status:
        "EXACT_TRANSACTION_PREPARED" as const,

      chainId:
        8453 as const,

      to:
        ethers.getAddress(
          encoded.to
        ),

      data:
        encoded.data,

      value: "0",

      action:
        "OPTIONBOOK_FILL_ORDER" as const,

      functionSelector:
        encoded.data.slice(
          0,
          10
        ),

      calldataHash,

      semanticDigest,

      expectedBeneficiary:
        beneficiary,

      expectedExecutor:
        beneficiary,

      referrer,

      maxTotalSpendUSDC:
        intent.maxPremiumUSDC.value,

      exactBuyerSpendUSDC:
        exactSpend,

      buyerSpendStatus:
        encoded.preview
          .buyerSpendStatus,

      buyerSpendVerificationMode:
        encoded.preview
          .buyerSpendVerificationMode,

      feeStatus:
        encoded.preview
          .feeStatus,

      canonicalOptionFactory:
        ethers.getAddress(
          canonicalOptionFactory
        ),

      order:
        semanticOrder,

      preparedAtMs:
        nowMs,

      validUntilMs,
    };

    /* ============================================================
     * 16. FINAL PREPARATION DIGEST
     * ============================================================ */

    const payload = {
      preparationId:
        `prep-${semanticDigest.slice(0, 20)}`,

      intentId:
        intent.intentId,

      intentVersion:
        intent.version,

      proposalId:
        proposal.proposalId,

      proposalDigest:
        proposal.proposalDigest,

      strategyId:
        proposal.strategyId,

      boundQuoteId:
        candidate.quoteId,

      marketSnapshotId:
        snapshot.snapshotId,

      marketSnapshotDigest:
        snapshot.snapshotDigest,

      candidateDigest:
        recomputedCandidateDigest,

      intentDigest:
        computeIntentDigest(
          intent
        ),

      policyDecisionDigest,

      previewEvidenceDigest:
        sha256Digest(
          encoded.preview
        ),

      transaction,

      status:
        "EXACT_TRANSACTION_PREPARED" as const,

      createdAtMs:
        nowMs,
    };

    return {
      ...payload,

      preparationDigest:
        sha256Digest(payload),
    };
  }

  /* ============================================================
   * POLICY
   * ============================================================ */

  private assertPolicyPass(
    decision: PolicyDecisionRecord,
    intent: TypedRiskIntent,
    proposal: ActionProposal
  ): void {
    if (!decision) {
      throw new Error(
        "Authoritative Financial Constitution decision is required"
      );
    }

    if (
      decision.intentId !==
      intent.intentId
    ) {
      throw new Error(
        "Policy decision belongs to a different intent"
      );
    }

    if (
      decision.strategyId !==
      proposal.strategyId
    ) {
      throw new Error(
        "Policy decision belongs to a different strategy"
      );
    }

    if (
      decision.overallStatus !==
      "PASS" ||
      decision.passedAllInvariants !==
      true
    ) {
      throw new Error(
        "Financial Constitution did not PASS"
      );
    }

    if (
      decision.stage ===
      "RFQ_SPECIFICATION"
    ) {
      throw new Error(
        "RFQ policy evidence cannot authorize OptionBook exact preparation"
      );
    }

    if (
      decision.checks.length ===
      0 ||
      decision.checks.some(
        (check) =>
          check.status !==
          "PASS"
      )
    ) {
      throw new Error(
        "Financial Constitution contains incomplete or failed checks"
      );
    }
  }

  /* ============================================================
   * PROTOCOL SEMANTICS
   * ============================================================ */

  private isPutOrder(
    raw: any,
    normalized: any
  ): boolean {
    const candidates = [
      raw?.optionType,
      normalized?.optionType,
    ];

    for (const value of candidates) {
      if (
        value === 1 ||
        value === 1n ||
        String(value)
          .trim()
          .toUpperCase() ===
        "PUT" ||
        String(value).trim() ===
        "1"
      ) {
        return true;
      }

      if (
        value === 0 ||
        value === 0n ||
        String(value)
          .trim()
          .toUpperCase() ===
        "CALL" ||
        String(value).trim() ===
        "0"
      ) {
        return false;
      }
    }

    if (
      raw?.isCall === false
    ) {
      return true;
    }

    if (
      raw?.isCall === true
    ) {
      return false;
    }

    if (
      normalized?.isCall ===
      false
    ) {
      return true;
    }

    return false;
  }

  /* ============================================================
   * EXACT COMPARISON HELPERS
   * ============================================================ */

  private assertTokenAmountEquals(
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

  private requiredAddress(
    value: unknown,
    field: string
  ): string {
    if (
      typeof value !==
      "string" ||
      !ethers.isAddress(value)
    ) {
      throw new Error(
        `Signed order ${field} is invalid`
      );
    }

    return ethers.getAddress(
      value
    );
  }

  private requiredString(
    value: unknown,
    field: string
  ): string {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() ===
      ""
    ) {
      throw new Error(
        `Signed order ${field} is unavailable`
      );
    }

    return String(value);
  }

  private requiredIntegerString(
    value: unknown,
    field: string
  ): string {
    const text =
      this.requiredString(
        value,
        field
      );

    try {
      BigInt(text);
    } catch {
      throw new Error(
        `Signed order ${field} is not valid integer evidence`
      );
    }

    return text;
  }

  private requiredPositiveIntegerString(
    value: unknown,
    field: string
  ): string {
    const text =
      this.requiredIntegerString(
        value,
        field
      );

    if (BigInt(text) <= 0n) {
      throw new Error(
        `Signed order ${field} must be positive`
      );
    }

    return text;
  }
}
