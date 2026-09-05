import {
  OPTION_ABI,
  OPTION_BOOK_ABI,
} from "@thetanuts-finance/thetanuts-client";
import { ethers } from "ethers";
import {
  ExecutionPreparation,
  ExecutionVerificationRecord,
  OptionRight,
  PositionEvidence,
  ProtocolEventEvidence,
} from "../types";
import { sha256Digest } from "../utils/canonicalDigest";

const OPTIONBOOK_TO_OPTION_SCALE =
  1_000_000_000_000n;

export interface ReadOnlyChainProvider {
  getNetwork(): Promise<{
    chainId: bigint;
  }>;

  getTransaction(
    hash: string
  ): Promise<any | null>;

  getTransactionReceipt(
    hash: string
  ): Promise<any | null>;

  getBlockNumber(): Promise<number>;

  getBlock(
    blockNumber: number
  ): Promise<any | null>;

  getCode(
    address: string
  ): Promise<string>;
}

/**
 * Independent read-only verifier.
 *
 * This class:
 * - never signs;
 * - never broadcasts;
 * - never stores a private key;
 * - only observes an externally supplied transaction hash and
 *   verifies it against a prior exact HedgeOS commitment.
 */
export class OnChainExecutionVerifier {
  private readonly requiredConfirmations: number;

  constructor(
    private provider: ReadOnlyChainProvider,
    requiredConfirmations = Number(
      process.env.EXECUTION_CONFIRMATIONS ||
      2
    ),
    private optionFactoryAddress?: string
  ) {
    this.requiredConfirmations =
      this.normalizeConfirmationCount(
        requiredConfirmations
      );
  }

  public async verify(
    preparation: ExecutionPreparation,
    transactionHash: string
  ): Promise<ExecutionVerificationRecord> {
    const checks:
      ExecutionVerificationRecord["checks"] =
      [];

    const add = (
      check: string,
      passed: boolean,
      details: string
    ): void => {
      checks.push({
        check,
        passed,
        details,
      });
    };

    const finish = (
      status:
        ExecutionVerificationRecord["status"],
      explanation: string,
      confirmations = 0,
      protocolEvent?:
        ProtocolEventEvidence,
      position?: PositionEvidence
    ): ExecutionVerificationRecord => {
      const payload = {
        verificationId:
          `verify-${transactionHash
            .replace(/^0x/, "")
            .slice(0, 16)}-${Date.now()}`,

        preparationId:
          preparation.preparationId,

        transactionHash,

        chainId:
          8453 as const,

        status,

        confirmations,

        requiredConfirmations:
          this.requiredConfirmations,

        checkedAtMs:
          Date.now(),

        checks,

        protocolEvent,

        position,

        explanation,
      };

      return {
        ...payload,

        verificationDigest:
          sha256Digest(payload),
      };
    };

    /* ============================================================
     * 1. LOCAL COMMITMENT VALIDITY
     * ============================================================ */

    if (
      preparation.status ===
      "INVALIDATED" ||
      preparation.status ===
      "EXPIRED"
    ) {
      add(
        "PREPARATION_STATUS",
        false,
        `Preparation status is ${preparation.status}.`
      );

      return finish(
        "INSUFFICIENT_EVIDENCE",
        "An invalidated or expired preparation cannot be treated as authoritative execution evidence."
      );
    }

    add(
      "PREPARATION_STATUS",
      true,
      `Preparation status ${preparation.status} is available for independent post-transaction verification.`
    );

    if (
      !/^0x[0-9a-fA-F]{64}$/.test(
        transactionHash
      )
    ) {
      add(
        "TRANSACTION_HASH",
        false,
        "Transaction hash must be a 32-byte hexadecimal value."
      );

      return finish(
        "INSUFFICIENT_EVIDENCE",
        "No valid transaction hash was supplied."
      );
    }

    const expected =
      preparation.transaction;

    /* ============================================================
     * 2. CANONICAL FACTORY EVIDENCE
     * ============================================================ */

    const canonicalFactory =
      expected.canonicalOptionFactory ||
      this.optionFactoryAddress;

    if (
      !canonicalFactory ||
      !ethers.isAddress(
        canonicalFactory
      )
    ) {
      add(
        "CANONICAL_OPTION_FACTORY",
        false,
        "Canonical Thetanuts OptionFactory address is unavailable."
      );

      return finish(
        "INSUFFICIENT_EVIDENCE",
        "The resulting position cannot be verified without canonical OptionFactory evidence."
      );
    }

    add(
      "CANONICAL_OPTION_FACTORY",
      true,
      `Canonical OptionFactory is ${ethers.getAddress(
        canonicalFactory
      )}.`
    );

    try {
      /* ============================================================
       * 3. CHAIN
       * ============================================================ */

      const network =
        await this.provider.getNetwork();

      if (
        network.chainId !== 8453n
      ) {
        add(
          "CHAIN_ID",
          false,
          `Connected read provider returned chain ${network.chainId.toString()}, expected Base 8453.`
        );

        return finish(
          "MISMATCH",
          "Wrong verification chain."
        );
      }

      add(
        "CHAIN_ID",
        true,
        "Read-only verification provider is connected to Base Mainnet chain 8453."
      );

      /* ============================================================
       * 4. TRANSACTION + RECEIPT
       * ============================================================ */

      const [tx, receipt] =
        await Promise.all([
          this.provider.getTransaction(
            transactionHash
          ),

          this.provider.getTransactionReceipt(
            transactionHash
          ),
        ]);

      if (!tx) {
        add(
          "TRANSACTION_EXISTS",
          false,
          "Transaction is not currently observable from the configured Base provider."
        );

        return finish(
          "INSUFFICIENT_EVIDENCE",
          "Transaction was not found."
        );
      }

      add(
        "TRANSACTION_EXISTS",
        true,
        "Transaction was independently observed by hash."
      );

      if (!receipt) {
        add(
          "RECEIPT_EXISTS",
          false,
          "Transaction exists but a mined receipt is not yet available."
        );

        return finish(
          "EXECUTION_OBSERVED",
          "Transaction observed; receipt is still pending."
        );
      }

      add(
        "RECEIPT_EXISTS",
        true,
        "A mined transaction receipt was observed."
      );

      if (
        Number(receipt.status) !== 1
      ) {
        add(
          "RECEIPT_SUCCESS",
          false,
          "Receipt status reports transaction failure/revert."
        );

        return finish(
          "REVERTED",
          "The external transaction reverted."
        );
      }

      add(
        "RECEIPT_SUCCESS",
        true,
        "Receipt status reports successful execution."
      );

      /* ============================================================
       * 5. CANONICAL BLOCK / CONFIRMATIONS
       * ============================================================ */

      const currentBlock =
        await this.provider.getBlockNumber();

      const receiptBlockNumber =
        Number(receipt.blockNumber);

      const confirmations =
        Math.max(
          0,
          currentBlock -
          receiptBlockNumber +
          1
        );

      const canonicalBlock =
        await this.provider.getBlock(
          receiptBlockNumber
        );

      const canonical =
        Boolean(
          canonicalBlock &&
          canonicalBlock.hash &&
          receipt.blockHash &&
          String(
            canonicalBlock.hash
          ).toLowerCase() ===
          String(
            receipt.blockHash
          ).toLowerCase()
        );

      if (!canonical) {
        add(
          "CANONICAL_BLOCK",
          false,
          "Receipt block hash no longer matches the canonical block at that height."
        );

        return finish(
          "REORGED_OR_UNSTABLE",
          "The observed receipt is not stable on the canonical chain.",
          confirmations
        );
      }

      add(
        "CANONICAL_BLOCK",
        true,
        "Receipt block hash matches the current canonical block."
      );

      if (
        confirmations <
        this.requiredConfirmations
      ) {
        add(
          "CONFIRMATIONS",
          false,
          `${confirmations}/${this.requiredConfirmations} required confirmations observed.`
        );

        return finish(
          "PENDING_CONFIRMATIONS",
          "Waiting for the configured confirmation policy.",
          confirmations
        );
      }

      add(
        "CONFIRMATIONS",
        true,
        `${confirmations} confirmations satisfy the configured verification policy.`
      );

      /* ============================================================
       * 6. EXACT TRANSACTION COMMITMENT
       * ============================================================ */

      const targetMatches =
        String(
          tx.to || ""
        ).toLowerCase() ===
        expected.to.toLowerCase();

      add(
        "TARGET",
        targetMatches,
        targetMatches
          ? "Transaction target exactly matches the prepared Thetanuts OptionBook target."
          : `Observed target ${String(
            tx.to
          )}; committed target ${expected.to}.`
      );

      let calldataMatches =
        false;

      try {
        calldataMatches =
          ethers.keccak256(
            String(tx.data)
          ).toLowerCase() ===
          expected.calldataHash.toLowerCase();
      } catch {
        calldataMatches =
          false;
      }

      add(
        "CALLDATA",
        calldataMatches,
        calldataMatches
          ? "Full calldata hash exactly matches the prepared transaction commitment."
          : "Observed calldata differs from the exact prepared commitment."
      );

      let valueMatches =
        false;

      try {
        valueMatches =
          BigInt(tx.value ?? 0) ===
          BigInt(expected.value);
      } catch {
        valueMatches =
          false;
      }

      add(
        "VALUE",
        valueMatches,
        valueMatches
          ? "Native transaction value exactly matches the prepared commitment."
          : "Native transaction value differs from the prepared commitment."
      );

      /*
       * Current HedgeOS scope uses direct-wallet execution:
       * executor == beneficiary.
       *
       * Keep the fields separate so future account abstraction or
       * delegated execution does not silently inherit this assumption.
       */
      const expectedExecutor =
        expected.expectedExecutor ||
        expected.expectedBeneficiary;

      const executorMatches =
        String(
          tx.from || ""
        ).toLowerCase() ===
        expectedExecutor.toLowerCase();

      add(
        "EXECUTOR",
        executorMatches,
        executorMatches
          ? "Transaction sender matches the committed external executor."
          : `Observed sender ${String(
            tx.from
          )}; committed executor ${expectedExecutor}.`
      );

      /* ============================================================
       * 7. ACTION DECODING
       * ============================================================ */

      const bookInterface =
        new ethers.Interface(
          OPTION_BOOK_ABI as any
        );

      let decoded:
        ethers.TransactionDescription | null =
        null;

      try {
        decoded =
          bookInterface.parseTransaction({
            data: tx.data,
            value: tx.value,
          });
      } catch {
        decoded = null;
      }

      const actionMatches =
        decoded?.name ===
        "fillOrder" &&
        String(tx.data).slice(
          0,
          10
        ) ===
        expected.functionSelector;

      add(
        "ACTION",
        actionMatches,
        actionMatches
          ? "Decoded transaction action is OptionBook.fillOrder."
          : "Observed transaction is not the committed OptionBook.fillOrder action."
      );

      if (
        ![
          targetMatches,
          calldataMatches,
          valueMatches,
          executorMatches,
          actionMatches,
        ].every(Boolean)
      ) {
        return finish(
          "MISMATCH",
          "Observed transaction semantics differ from the exact prepared action.",
          confirmations
        );
      }

      /*
       * Because the FULL calldata hash matches, all encoded fillOrder
       * arguments — including the exact buyer spend supplied to the
       * SDK — are already cryptographically bound here.
       *
       * We therefore do NOT pretend that OrderFilled.premiumAmount is
       * necessarily identical to total buyer spend.
       */

      /* ============================================================
       * 8. ORDERFILLED EVENT
       * ============================================================ */

      let protocolEvent:
        ProtocolEventEvidence | undefined;

      for (
        const log of
        receipt.logs || []
      ) {
        if (
          String(
            log.address || ""
          ).toLowerCase() !==
          expected.to.toLowerCase()
        ) {
          continue;
        }

        try {
          const parsed =
            bookInterface.parseLog(
              log
            );

          if (
            parsed?.name !==
            "OrderFilled"
          ) {
            continue;
          }

          protocolEvent = {
            transactionHash,

            blockNumber:
              receiptBlockNumber,

            blockHash:
              String(
                receipt.blockHash
              ),

            logIndex:
              Number(
                log.index ??
                log.logIndex ??
                0
              ),

            nonce:
              String(
                parsed.args.nonce
              ),

            buyer:
              String(
                parsed.args.buyer
              ),

            seller:
              String(
                parsed.args.seller
              ),

            optionAddress:
              String(
                parsed.args
                  .optionAddress
              ),

            premiumAmount:
              String(
                parsed.args
                  .premiumAmount
              ),

            feeCollected:
              String(
                parsed.args
                  .feeCollected
              ),

            referrer:
              String(
                parsed.args
                  .referrer
              ),

            referralFeePaid:
              String(
                parsed.args
                  .referralFeePaid
              ),

            sellerWasMaker:
              Boolean(
                parsed.args
                  .sellerWasMaker
              ),
          };

          break;
        } catch {
          continue;
        }
      }

      if (!protocolEvent) {
        add(
          "ORDER_FILLED_EVENT",
          false,
          "No decodable OrderFilled event from the committed OptionBook contract was found."
        );

        return finish(
          "INSUFFICIENT_EVIDENCE",
          "A successful receipt alone does not prove that the intended protection position was created.",
          confirmations
        );
      }

      add(
        "ORDER_FILLED_EVENT",
        true,
        "Expected OptionBook OrderFilled event was decoded from the canonical receipt."
      );

      /* ============================================================
       * 9. EVENT SEMANTICS
       * ============================================================ */

      const eventNonceMatches =
        protocolEvent.nonce ===
        expected.order.nonce;

      add(
        "EVENT_NONCE",
        eventNonceMatches,
        eventNonceMatches
          ? "OrderFilled nonce matches the canonical committed order nonce."
          : `Observed nonce ${protocolEvent.nonce}; expected ${expected.order.nonce}.`
      );

      const eventBuyerMatches =
        protocolEvent.buyer.toLowerCase() ===
        expected.expectedBeneficiary.toLowerCase();

      add(
        "EVENT_BUYER",
        eventBuyerMatches,
        eventBuyerMatches
          ? "OrderFilled buyer matches the expected protection beneficiary."
          : "OrderFilled buyer differs from the expected beneficiary."
      );

      const eventSellerMatches =
        protocolEvent.seller.toLowerCase() ===
        expected.order.maker.toLowerCase();

      add(
        "EVENT_SELLER",
        eventSellerMatches,
        eventSellerMatches
          ? "OrderFilled seller matches the signed-order maker."
          : "OrderFilled seller differs from the signed-order maker."
      );

      const eventDirectionMatches =
        protocolEvent.sellerWasMaker ===
        true;

      add(
        "EVENT_DIRECTION",
        eventDirectionMatches,
        eventDirectionMatches
          ? "Protocol event confirms the seller was the maker, consistent with HedgeOS taker-buying protection."
          : "Protocol event does not confirm maker-sells/taker-buys direction."
      );

      const eventReferrerMatches =
        protocolEvent.referrer.toLowerCase() ===
        expected.referrer.toLowerCase();

      add(
        "EVENT_REFERRER",
        eventReferrerMatches,
        eventReferrerMatches
          ? "OrderFilled referrer matches the prepared action."
          : "OrderFilled referrer differs from the prepared action."
      );

      let premiumNonNegative =
        false;
      let feeNonNegative =
        false;
      let referralFeeNonNegative =
        false;
      let premiumWithinCommittedSpend =
        false;

      try {
        const premium =
          BigInt(
            protocolEvent.premiumAmount
          );

        const fee =
          BigInt(
            protocolEvent.feeCollected
          );

        const referralFee =
          BigInt(
            protocolEvent.referralFeePaid
          );

        const exactBuyerSpend =
          BigInt(
            expected
              .exactBuyerSpendUSDC
              .amountBaseUnits
          );

        premiumNonNegative =
          premium >= 0n;

        feeNonNegative =
          fee >= 0n;

        referralFeeNonNegative =
          referralFee >= 0n;

        /*
         * Conservative check only.
         *
         * We do NOT assert:
         * premiumAmount == total buyer spend
         *
         * because the event exposes separate fee fields and the
         * installed SDK's fee semantics are not sufficient to prove
         * that equality.
         *
         * Exact total spend is already committed through the exact
         * calldata hash.
         */
        premiumWithinCommittedSpend =
          premium >= 0n &&
          premium <=
          exactBuyerSpend;
      } catch {
        premiumNonNegative =
          false;
        feeNonNegative =
          false;
        referralFeeNonNegative =
          false;
        premiumWithinCommittedSpend =
          false;
      }

      add(
        "EVENT_PREMIUM_NON_NEGATIVE",
        premiumNonNegative,
        premiumNonNegative
          ? "OrderFilled premium amount is valid non-negative evidence."
          : "OrderFilled premium amount could not be validated."
      );

      add(
        "EVENT_FEE_NON_NEGATIVE",
        feeNonNegative,
        feeNonNegative
          ? "OrderFilled feeCollected is valid non-negative evidence."
          : "OrderFilled feeCollected could not be validated."
      );

      add(
        "EVENT_REFERRAL_FEE_NON_NEGATIVE",
        referralFeeNonNegative,
        referralFeeNonNegative
          ? "OrderFilled referralFeePaid is valid non-negative evidence."
          : "OrderFilled referralFeePaid could not be validated."
      );

      add(
        "EVENT_PREMIUM_WITHIN_COMMITTED_SPEND",
        premiumWithinCommittedSpend,
        premiumWithinCommittedSpend
          ? "Event premium does not exceed the exact buyer-spend amount committed in the matching calldata."
          : "Event premium exceeds or cannot be reconciled conservatively with the committed buyer-spend bound."
      );

      let spendWithinConfirmedCap =
        false;

      try {
        spendWithinConfirmedCap =
          BigInt(
            expected
              .exactBuyerSpendUSDC
              .amountBaseUnits
          ) <=
          BigInt(
            expected
              .maxTotalSpendUSDC
              .amountBaseUnits
          );
      } catch {
        spendWithinConfirmedCap =
          false;
      }

      add(
        "COMMITTED_SPEND_CAP",
        spendWithinConfirmedCap,
        spendWithinConfirmedCap
          ? "Exact buyer spend committed by calldata remains within the user-confirmed maximum spend."
          : "Committed exact buyer spend exceeds the confirmed maximum."
      );

      if (
        ![
          eventNonceMatches,
          eventBuyerMatches,
          eventSellerMatches,
          eventDirectionMatches,
          eventReferrerMatches,
          premiumNonNegative,
          feeNonNegative,
          referralFeeNonNegative,
          premiumWithinCommittedSpend,
          spendWithinConfirmedCap,
        ].every(Boolean)
      ) {
        return finish(
          "MISMATCH",
          "Protocol event evidence differs from or is inconsistent with the committed protection action.",
          confirmations,
          protocolEvent
        );
      }

      /* ============================================================
       * 10. RESULTING OPTION POSITION
       * ============================================================ */

      if (
        !ethers.isAddress(
          protocolEvent.optionAddress
        )
      ) {
        add(
          "EVENT_OPTION_ADDRESS",
          false,
          "OrderFilled did not provide a valid option-contract address."
        );

        return finish(
          "INSUFFICIENT_EVIDENCE",
          "Protocol event does not identify a valid resulting option position.",
          confirmations,
          protocolEvent
        );
      }

      add(
        "EVENT_OPTION_ADDRESS",
        true,
        "OrderFilled identifies a valid resulting option-contract address."
      );

      const position =
        await this.readPosition(
          protocolEvent.optionAddress,
          expected,
          protocolEvent,
          canonicalFactory
        );

      for (
        const item of
        position.checks
      ) {
        add(
          `POSITION_${item.field}`,
          item.passed,
          item.details
        );
      }

      if (
        position.checks.some(
          (item) =>
            !item.passed
        )
      ) {
        return finish(
          "MISMATCH",
          "Resulting option-contract state differs from the committed protection semantics.",
          confirmations,
          protocolEvent,
          position
        );
      }

      return finish(
        "POSITION_CONFIRMED",
        "Protection was independently confirmed on Base from the exact committed calldata, canonical OptionBook event, and resulting PUT option-contract state. Financial protection remains modeled at expiry rather than guaranteed.",
        confirmations,
        protocolEvent,
        position
      );
    } catch (error) {
      add(
        "VERIFIER_COMPLETED",
        false,
        error instanceof Error
          ? error.message
          : "Unknown read-only verification failure"
      );

      return finish(
        "INSUFFICIENT_EVIDENCE",
        "Independent on-chain verification could not be completed."
      );
    }
  }

  /* ============================================================
   * POSITION VERIFICATION
   * ============================================================ */

  private async readPosition(
    optionAddress: string,
    expected:
      ExecutionPreparation["transaction"],
    event: ProtocolEventEvidence,
    canonicalFactory: string
  ): Promise<PositionEvidence> {
    const contract =
      new ethers.Contract(
        optionAddress,
        OPTION_ABI as any,
        this.provider as any
      );

    const [
      code,
      buyer,
      seller,
      optionType,
      implementation,
      strikes,
      expiry,
      priceFeed,
      collateralToken,
      numContracts,
      collateralAmount,
      factory,
    ] = await Promise.all([
      this.provider.getCode(
        optionAddress
      ),

      contract.buyer(),

      contract.seller(),

      contract.optionType(),

      contract.getImplementation(),

      contract.getStrikes(),

      contract.expiryTimestamp(),

      contract.chainlinkPriceFeed(),

      contract.collateralToken(),

      contract.numContracts(),

      contract.collateralAmount(),

      contract.factory(),
    ]);

    const checks:
      PositionEvidence["checks"] =
      [];

    const add = (
      field: string,
      passed: boolean,
      details: string
    ): void => {
      checks.push({
        field,
        passed,
        details,
      });
    };

    /* ============================================================
     * BYTECODE
     * ============================================================ */

    const bytecodePresent =
      typeof code === "string" &&
      code !== "0x" &&
      code.length > 2;

    add(
      "BYTECODE",
      bytecodePresent,
      bytecodePresent
        ? "Resulting option address contains deployed contract bytecode."
        : "Resulting option address does not contain deployed contract bytecode."
    );

    /* ============================================================
     * BUYER / SELLER
     * ============================================================ */

    const buyerMatches =
      String(
        buyer
      ).toLowerCase() ===
      expected.expectedBeneficiary.toLowerCase();

    add(
      "BUYER",
      buyerMatches,
      buyerMatches
        ? "Option contract buyer matches the committed protection beneficiary."
        : "Option contract buyer differs from the committed beneficiary."
    );

    const sellerMatches =
      String(
        seller
      ).toLowerCase() ===
      expected.order.maker.toLowerCase();

    add(
      "SELLER",
      sellerMatches,
      sellerMatches
        ? "Option contract seller matches the signed-order maker."
        : "Option contract seller differs from the signed-order maker."
    );

    /* ============================================================
     * OPTION TYPE — MUST ACTUALLY BE PUT
     * ============================================================ */

    const normalizedOptionType =
      this.normalizeOptionType(
        optionType
      );

    const isPut =
      normalizedOptionType ===
      "PUT";

    add(
      "OPTION_TYPE",
      isPut,
      isPut
        ? `On-chain optionType ${String(
          optionType
        )} is normalized as PUT.`
        : `On-chain optionType ${String(
          optionType
        )} does not prove a PUT position.`
    );

    /* ============================================================
     * IMPLEMENTATION
     * ============================================================ */

    const implementationMatches =
      String(
        implementation
      ).toLowerCase() ===
      expected.order.implementation.toLowerCase();

    add(
      "IMPLEMENTATION",
      implementationMatches,
      implementationMatches
        ? "Resulting option implementation exactly matches the signed order."
        : "Resulting option implementation differs from the signed order."
    );

    /* ============================================================
     * FULL STRIKE STRUCTURE
     * ============================================================ */

    const strikeStrings =
      Array.from(
        strikes as bigint[]
      ).map(String);

    const strikesMatch =
      JSON.stringify(
        strikeStrings
      ) ===
      JSON.stringify(
        expected.order.strikes
      );

    add(
      "STRIKES",
      strikesMatch,
      strikesMatch
        ? "Full on-chain strike array exactly matches the committed signed order."
        : "On-chain strike array differs from the committed order."
    );

    /* ============================================================
     * EXPIRY
     * ============================================================ */

    const expiryMatches =
      String(expiry) ===
      expected.order.expiry;

    add(
      "EXPIRY",
      expiryMatches,
      expiryMatches
        ? "Option expiry exactly matches the committed signed order."
        : "Option expiry differs from the committed signed order."
    );

    /* ============================================================
     * PRICE FEED
     * ============================================================ */

    const priceFeedMatches =
      String(
        priceFeed
      ).toLowerCase() ===
      expected.order.priceFeed.toLowerCase();

    add(
      "PRICE_FEED",
      priceFeedMatches,
      priceFeedMatches
        ? "Option price feed exactly matches the signed order."
        : "Option price feed differs from the signed order."
    );

    /* ============================================================
     * COLLATERAL
     * ============================================================ */

    const collateralMatches =
      String(
        collateralToken
      ).toLowerCase() ===
      expected.order.collateral.toLowerCase();

    add(
      "COLLATERAL",
      collateralMatches,
      collateralMatches
        ? "Option collateral token exactly matches the signed order."
        : "Option collateral token differs from the signed order."
    );

    /* ============================================================
     * QUANTITY
     *
     * OptionBook order contracts use 6 decimals.
     * The resulting option contract quantity is represented at
     * option-token precision (18 decimals).
     * ============================================================ */

    let expectedOptionQuantity18:
      bigint;

    try {
      expectedOptionQuantity18 =
        expected.order
          .expectedOptionQuantity18
          ? BigInt(
            expected.order
              .expectedOptionQuantity18
          )
          : BigInt(
            expected.order
              .numContracts
          ) *
          OPTIONBOOK_TO_OPTION_SCALE;
    } catch {
      expectedOptionQuantity18 =
        -1n;
    }

    let observedNumContracts:
      bigint;

    try {
      observedNumContracts =
        BigInt(numContracts);
    } catch {
      observedNumContracts =
        -2n;
    }

    const quantityMatches =
      expectedOptionQuantity18 >
      0n &&
      observedNumContracts ===
      expectedOptionQuantity18;

    add(
      "QUANTITY",
      quantityMatches,
      quantityMatches
        ? `On-chain option quantity ${observedNumContracts.toString()} exactly matches the committed 18-decimal protection quantity.`
        : `Observed option quantity ${observedNumContracts.toString()} does not match expected 18-decimal quantity ${expectedOptionQuantity18.toString()}.`
    );

    /* ============================================================
     * COLLATERAL AMOUNT
     *
     * We do not invent an exact collateral formula here.
     * We require positive protocol collateral evidence.
     * ============================================================ */

    let collateralAmountValid =
      false;

    try {
      collateralAmountValid =
        BigInt(
          collateralAmount
        ) > 0n;
    } catch {
      collateralAmountValid =
        false;
    }

    add(
      "COLLATERAL_AMOUNT",
      collateralAmountValid,
      collateralAmountValid
        ? "Resulting option contract reports positive collateral evidence."
        : "Resulting option contract does not report valid positive collateral evidence."
    );

    /* ============================================================
     * FACTORY
     *
     * IMPORTANT:
     * factory() must be the canonical OptionFactory.
     *
     * The old implementation incorrectly also allowed OptionBook.
     * ============================================================ */

    const canonicalFactoryNormalized =
      ethers.getAddress(
        canonicalFactory
      ).toLowerCase();

    const observedFactory =
      String(
        factory || ""
      ).toLowerCase();

    const factoryMatches =
      observedFactory ===
      canonicalFactoryNormalized;

    add(
      "PROTOCOL_FACTORY",
      factoryMatches,
      factoryMatches
        ? "Option contract factory exactly matches the canonical SDK-configured Thetanuts OptionFactory."
        : `Observed factory ${String(
          factory
        )}; expected canonical OptionFactory ${ethers.getAddress(
          canonicalFactory
        )}.`
    );

    /* ============================================================
     * EVENT ↔ POSITION BINDING
     * ============================================================ */

    const eventOptionMatches =
      ethers.isAddress(
        event.optionAddress
      ) &&
      ethers.getAddress(
        event.optionAddress
      ).toLowerCase() ===
      ethers.getAddress(
        optionAddress
      ).toLowerCase();

    add(
      "EVENT_OPTION",
      eventOptionMatches,
      eventOptionMatches
        ? "The verified position address is exactly the option address emitted by OrderFilled."
        : "Resulting position address is not bound to the OrderFilled event."
    );

    return {
      optionAddress,

      bytecodePresent,

      buyer:
        String(buyer),

      seller:
        String(seller),

      optionType:
        String(optionType),

      normalizedOptionType:
        normalizedOptionType ||
        undefined,

      implementation:
        String(
          implementation
        ),

      strikes:
        strikeStrings,

      expiryTimestamp:
        String(expiry),

      priceFeed:
        String(priceFeed),

      collateralToken:
        String(
          collateralToken
        ),

      numContracts:
        String(
          numContracts
        ),

      collateralAmount:
        String(
          collateralAmount
        ),

      factory:
        String(factory),

      checks,
    };
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */

  private normalizeOptionType(
    value: unknown
  ): OptionRight | null {
    if (
      value === 1 ||
      value === 1n
    ) {
      return "PUT";
    }

    if (
      value === 0 ||
      value === 0n
    ) {
      return "CALL";
    }

    const normalized =
      String(value)
        .trim()
        .toUpperCase();

    if (
      normalized === "1" ||
      normalized === "PUT"
    ) {
      return "PUT";
    }

    if (
      normalized === "0" ||
      normalized === "CALL"
    ) {
      return "CALL";
    }

    return null;
  }

  private normalizeConfirmationCount(
    value: number
  ): number {
    if (
      !Number.isFinite(value)
    ) {
      return 2;
    }

    const integer =
      Math.floor(value);

    /*
     * Fail to a sensible bounded verification policy.
     */
    if (integer < 1) {
      return 1;
    }

    if (integer > 64) {
      return 64;
    }

    return integer;
  }
}