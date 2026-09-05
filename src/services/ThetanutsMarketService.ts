import { ThetanutsClient } from "@thetanuts-finance/thetanuts-client";
import { ethers } from "ethers";
import {
  OptionBookQuoteSource,
  RFQQuoteSource,
  ThetanutsMarketProvider,
} from "../providers/interfaces/ThetanutsMarketProvider";
import {
  MarketQuote,
  MarketStateRecord,
  MarketStatus,
  MarketSnapshotEvidence,
  PremiumPreview,
  PreSignRevalidationCheck,
  PreSignRevalidationStatus,
  RFQQuote,
  TypedRiskIntent,
} from "../types";
import {
  OptionBookOrderEligibilityEngine,
  VanillaPutImplementation,
} from "./OptionBookOrderEligibilityEngine";
import { usdc6ForContracts6 } from "./ExactFinancialMath";
import { sha256Digest } from "../utils/canonicalDigest";

const OPTIONBOOK_CONTRACT_SCALE = 1_000_000_000_000n;
const CONTRACTS_6_SCALE = 1_000_000n;

export interface ExactFillEncoding {
  to: string;
  data: string;
  buyerSpendUSDC6: bigint;
  numContracts6: bigint;
  rawOrder: any;
  preview: PremiumPreview;
}

export interface ExactFillRevalidationResult {
  status: PreSignRevalidationStatus;
  checkedAtMs: number;
  snapshot?: MarketSnapshotEvidence;
  freshQuote?: MarketQuote;
  encoded?: ExactFillEncoding;
  refreshedMaxContracts6?: bigint;
  checks: PreSignRevalidationCheck[];
  blockers: string[];
  explanation: string;
}

export class ThetanutsOptionBookSource
  implements OptionBookQuoteSource {
  public get status(): MarketStatus {
    return this.service.getMarketStateSync().status;
  }

  constructor(
    private service: ThetanutsMarketService
  ) { }

  public async fetchExecutableOrders(
    intent: TypedRiskIntent
  ): Promise<MarketQuote[]> {
    return this.service.fetchMarketQuotes(intent);
  }
}

export class ThetanutsRFQSource
  implements RFQQuoteSource {
  public readonly status =
    "LIVE_RFQ_NOT_VERIFIED" as const;

  public async requestCustomQuote(
    _intent: TypedRiskIntent
  ): Promise<MarketQuote[]> {
    return [];
  }
}

export class ThetanutsMarketService
  implements ThetanutsMarketProvider {
  public optionBookSource: OptionBookQuoteSource;
  public rfqSource: RFQQuoteSource;

  private client: ThetanutsClient | null = null;
  private provider: ethers.JsonRpcProvider | null =
    null;

  private readonly chainId = 8453;

  private rpcUrl: string;

  private marketState: MarketStateRecord;

  private spotPricesCache: Record<string, number> =
    {};

  private lastFetchTimeMs = 0;

  constructor(customRpcUrl?: string) {
    if (customRpcUrl !== undefined) {
      this.rpcUrl = customRpcUrl;
    } else if (process.env.BASE_RPC_URL) {
      this.rpcUrl = process.env.BASE_RPC_URL;
    } else {
      this.rpcUrl = "";
    }

    this.marketState = {
      status: this.rpcUrl
        ? "CONNECTING"
        : "NOT_CONFIGURED",
      chainId: this.chainId,
      timestampMs: Date.now(),
      source:
        "ThetanutsClient (Base Mainnet 8453)",
      orderCount: 0,
      error: this.rpcUrl
        ? undefined
        : "RPC URL not configured",
    };

    this.optionBookSource =
      new ThetanutsOptionBookSource(this);

    this.rfqSource =
      new ThetanutsRFQSource();

    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const providerUrl =
        this.rpcUrl ||
        "https://mainnet.base.org";

      this.provider =
        new ethers.JsonRpcProvider(providerUrl);

      this.client = new ThetanutsClient({
        chainId: this.chainId,
        provider: this.provider,
      });

      if (this.rpcUrl) {
        this.marketState.status = "CONNECTING";
        this.marketState.error = undefined;
        this.marketState.timestampMs =
          Date.now();
      }
    } catch {
      this.client = null;
      this.provider = null;

      this.marketState = {
        status: "LIVE_READ_FAILED",
        chainId: this.chainId,
        timestampMs: Date.now(),
        source: "ThetanutsClient",
        orderCount: 0,
        error:
          "Failed to initialize Thetanuts market client",
      };
    }
  }

  private isRateLimitError(
    error: unknown
  ): boolean {
    const anyError = error as any;

    const status =
      anyError?.status ??
      anyError?.response?.status ??
      anyError?.cause?.status;

    if (Number(status) === 429) {
      return true;
    }

    const message = String(
      anyError?.message || ""
    ).toLowerCase();

    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("too many requests")
    );
  }

  private normalizeAddress(
    value: unknown
  ): string {
    return typeof value === "string"
      ? value.trim().toLowerCase()
      : "";
  }

  private normalizeAssetSymbol(
    asset: string
  ): string {
    const symbol = asset.toUpperCase();

    if (symbol === "WETH") {
      return "ETH";
    }

    if (symbol === "CBBTC") {
      return "BTC";
    }

    return symbol;
  }

  private scaleBaseUnits(
    amount: bigint,
    fromDecimals: number,
    toDecimals: number
  ): bigint {
    if (fromDecimals === toDecimals) {
      return amount;
    }

    if (fromDecimals < toDecimals) {
      return (
        amount *
        10n **
        BigInt(
          toDecimals - fromDecimals
        )
      );
    }

    return (
      amount /
      10n **
      BigInt(
        fromDecimals - toDecimals
      )
    );
  }

  private unwrapOptionBookOrder(
    input: any
  ): any | null {
    if (!input) {
      return null;
    }

    /*
     * MarketQuote.rawApiData stores the full
     * OrderWithSignature object.
     */
    if (
      input.rawApiData &&
      input.rawApiData.order
    ) {
      return input.rawApiData;
    }

    /*
     * Direct OrderWithSignature.
     */
    if (input.order) {
      return input;
    }

    return null;
  }

  private getRawStrikes(
    orderWithSignature: any
  ): string[] {
    const raw =
      orderWithSignature?.rawApiData;

    const normalized =
      orderWithSignature?.order;

    if (
      Array.isArray(raw?.strikes) &&
      raw.strikes.length > 0
    ) {
      return raw.strikes.map(
        (strike: unknown) =>
          String(strike)
      );
    }

    if (
      Array.isArray(
        normalized?.strikes
      ) &&
      normalized.strikes.length > 0
    ) {
      return normalized.strikes.map(
        (strike: unknown) =>
          String(strike)
      );
    }

    return [];
  }

  private resolveOrderOptionRight(
    orderWithSignature: any
  ): "PUT" | "CALL" | null {
    const raw =
      orderWithSignature?.rawApiData;

    const normalized =
      orderWithSignature?.order;

    /*
     * Current SDK semantics:
     * optionType = 1 => PUT
     * optionType = 0 => CALL
     */
    const candidates = [
      raw?.optionType,
      normalized?.optionType,
    ];

    for (const value of candidates) {
      if (
        value === 1 ||
        value === 1n ||
        String(value).toUpperCase() ===
        "PUT"
      ) {
        return "PUT";
      }

      if (
        value === 0 ||
        value === 0n ||
        String(value).toUpperCase() ===
        "CALL"
      ) {
        return "CALL";
      }
    }

    /*
     * Legacy API/fixture compatibility.
     */
    if (raw?.isCall === false) {
      return "PUT";
    }

    if (raw?.isCall === true) {
      return "CALL";
    }

    if (normalized?.isCall === false) {
      return "PUT";
    }

    if (normalized?.isCall === true) {
      return "CALL";
    }

    return null;
  }

  private resolveRawOptionTypeEvidence(
    orderWithSignature: any
  ): string | number | undefined {
    const raw =
      orderWithSignature?.rawApiData;

    const normalized =
      orderWithSignature?.order;

    if (
      raw?.optionType !== undefined &&
      raw?.optionType !== null
    ) {
      return raw.optionType;
    }

    if (
      normalized?.optionType !== undefined &&
      normalized?.optionType !== null
    ) {
      return normalized.optionType;
    }

    if (raw?.isCall === false) {
      return "PUT";
    }

    if (raw?.isCall === true) {
      return "CALL";
    }

    return undefined;
  }

  private getOrderIdentityPayload(
    orderWithSignature: any
  ): Record<string, unknown> {
    const raw =
      orderWithSignature?.rawApiData || {};

    const order =
      orderWithSignature?.order || {};

    return {
      maker:
        this.normalizeAddress(
          order.maker ??
          orderWithSignature?.makerAddress
        ),

      signature:
        String(
          orderWithSignature?.signature || ""
        ),

      nonce:
        String(order.nonce ?? ""),

      isLong:
        raw.isLong === true,

      optionRight:
        this.resolveOrderOptionRight(
          orderWithSignature
        ),

      implementation:
        this.normalizeAddress(
          raw.implementation ??
          order.implementation
        ),

      strikes:
        this.getRawStrikes(
          orderWithSignature
        ),

      expiry:
        String(
          order.expiry ??
          raw.expiry ??
          ""
        ),

      orderExpiryTimestamp:
        String(
          raw.orderExpiryTimestamp ??
          order.orderExpiryTimestamp ??
          ""
        ),

      priceFeed:
        this.normalizeAddress(
          raw.priceFeed ??
          order.priceFeed
        ),

      collateral:
        this.normalizeAddress(
          raw.collateral ??
          order.collateralToken
        ),

      price:
        String(order.price ?? ""),

      extraOptionData:
        String(
          raw.extraOptionData ??
          order.extraOptionData ??
          "0x"
        ),
    };
  }

  public getOrderIdentityDigest(
    input: any
  ): string {
    const rawOrder =
      this.unwrapOptionBookOrder(input);

    if (!rawOrder) {
      return "";
    }

    return sha256Digest(
      this.getOrderIdentityPayload(
        rawOrder
      )
    );
  }

  private getSupportedVanillaPutImplementations():
    VanillaPutImplementation[] {
    if (!this.client) {
      return [];
    }

    const config =
      this.client.chainConfig as any;

    const implementations:
      VanillaPutImplementation[] = [];

    for (const [address, info] of Object.entries(
      config.optionImplementations || {}
    )) {
      const typed = info as any;

      if (
        String(typed?.name).toUpperCase() ===
        "PUT" &&
        String(typed?.type).toUpperCase() ===
        "VANILLA" &&
        Number(typed?.numStrikes) === 1
      ) {
        implementations.push({
          address,
          name: "PUT",
          type: "VANILLA",
          numStrikes: 1,
        });
      }
    }

    const currentPut =
      config.implementations?.PUT;

    if (
      currentPut &&
      !implementations.some(
        (item) =>
          item.address.toLowerCase() ===
          String(currentPut).toLowerCase()
      )
    ) {
      implementations.push({
        address: String(currentPut),
        name: "PUT",
        type: "VANILLA",
        numStrikes: 1,
      });
    }

    return implementations;
  }

  private isControlledTestFixture(
    input: any
  ): boolean {
    if (process.env.NODE_ENV !== "test") {
      return false;
    }

    if (
      !input ||
      typeof input !== "object"
    ) {
      return false;
    }

    return !this.unwrapOptionBookOrder(
      input
    );
  }

  private calculateFixtureMaxContracts(
    input: any
  ): bigint {
    if (
      !this.isControlledTestFixture(
        input
      )
    ) {
      return 0n;
    }

    if (
      input.availableQuantity?.symbol ===
      "CONTRACTS"
    ) {
      try {
        return this.scaleBaseUnits(
          BigInt(
            input.availableQuantity
              .amountBaseUnits
          ),
          input.availableQuantity.decimals,
          6
        );
      } catch {
        return 0n;
      }
    }

    try {
      const availableAmountString =
        input.availableAmount ??
        input.availableQuantity
          ?.amountBaseUnits;

      if (
        availableAmountString ===
        undefined ||
        availableAmountString === null
      ) {
        return 0n;
      }

      const availableAmount =
        BigInt(
          availableAmountString
        );

      if (availableAmount <= 0n) {
        return 0n;
      }

      const collateralDecimals =
        input.availableQuantity
          ?.decimals ?? 6;

      const strikes =
        Array.isArray(input.strikes) &&
          input.strikes.length > 0
          ? input.strikes
          : input.strikePrice
            ?.amountBaseUnits
            ? [
              input.strikePrice
                .amountBaseUnits,
            ]
            : [];

      if (strikes.length !== 1) {
        return 0n;
      }

      const fixtureOptionRight =
        input.optionRight ??
        (input.optionType === 1
          ? "PUT"
          : input.optionType === 0
            ? "CALL"
            : input.isCall === true
              ? "CALL"
              : "PUT");

      if (
        String(
          fixtureOptionRight
        ).toUpperCase() !== "PUT"
      ) {
        return 0n;
      }

      const strike =
        BigInt(strikes[0]);

      if (strike <= 0n) {
        return 0n;
      }

      const strikeDecimals =
        input.strikePrice?.decimals ??
        8;

      const numerator =
        availableAmount *
        10n **
        BigInt(strikeDecimals) *
        CONTRACTS_6_SCALE;

      const denominator =
        strike *
        10n **
        BigInt(
          collateralDecimals
        );

      if (denominator <= 0n) {
        return 0n;
      }

      return (
        numerator / denominator
      );
    } catch {
      return 0n;
    }
  }

  private buildPreviewFailure(
    message: string
  ): PremiumPreview {
    return {
      previewStatus:
        "PREVIEW_FAILED",

      pricePerContract: {
        amountBaseUnits: "0",
        decimals: 8,
        symbol: "USD",
      },

      premiumAmount: {
        amountBaseUnits: "0",
        decimals: 6,
        symbol: "USDC",
      },

      protocolFee: {
        amountBaseUnits: "0",
        decimals: 6,
        symbol: "USDC",
      },

      referrerFee: {
        amountBaseUnits: "0",
        decimals: 6,
        symbol: "USDC",
      },

      totalExpectedCost: {
        amountBaseUnits: "0",
        decimals: 6,
        symbol: "USDC",
      },

      feeStatus: "NOT_AVAILABLE",

      buyerSpendStatus:
        "NOT_AVAILABLE",

      buyerSpendVerificationMode:
        "INCOMPLETE",

      feeEvidenceDetails:
        "No complete buyer-spend or fee evidence is available because the preview failed.",

      collateralToken:
        ethers.ZeroAddress,

      previewTimestampMs:
        Date.now(),

      previewSource:
        "THETANUTS_OPTIONBOOK_PREVIEW",

      error: message,
    };
  }

  private buildControlledFixturePreview(
    input: any,
    requestedContracts18?: bigint
  ): PremiumPreview | null {
    if (
      !this.isControlledTestFixture(
        input
      )
    ) {
      return null;
    }

    try {
      const requested =
        requestedContracts18 &&
          requestedContracts18 > 0n
          ? requestedContracts18
          : 1_000_000_000_000_000_000n;

      let pricePerContract8 = 0n;
      let totalCost6 = 0n;

      if (
        input.pricePerContract !==
        undefined
      ) {
        pricePerContract8 =
          BigInt(
            input.pricePerContract
          );

        if (
          pricePerContract8 <= 0n
        ) {
          return null;
        }

        const numerator =
          requested *
          pricePerContract8;

        const denominator =
          100_000_000_000_000_000_000n;

        totalCost6 =
          (numerator +
            denominator -
            1n) /
          denominator;
      } else if (
        input.premium
          ?.amountBaseUnits !==
        undefined
      ) {
        totalCost6 =
          this.scaleBaseUnits(
            BigInt(
              input.premium
                .amountBaseUnits
            ),
            input.premium.decimals,
            6
          );

        if (requested > 0n) {
          pricePerContract8 =
            (totalCost6 *
              100_000_000_000_000_000_000n) /
            requested;
        }
      } else {
        return null;
      }

      if (totalCost6 < 0n) {
        return null;
      }

      return {
        previewStatus:
          "PREVIEW_AVAILABLE",

        pricePerContract: {
          amountBaseUnits:
            pricePerContract8.toString(),
          decimals: 8,
          symbol: "USD",
        },

        premiumAmount: {
          amountBaseUnits:
            totalCost6.toString(),
          decimals: 6,
          symbol: "USDC",
        },

        protocolFee: {
          amountBaseUnits: "0",
          decimals: 6,
          symbol: "USDC",
        },

        referrerFee: {
          amountBaseUnits: "0",
          decimals: 6,
          symbol: "USDC",
        },

        totalExpectedCost: {
          amountBaseUnits:
            totalCost6.toString(),
          decimals: 6,
          symbol: "USDC",
        },

        feeStatus: "VERIFIED",

        buyerSpendStatus:
          "VERIFIED",

        buyerSpendVerificationMode:
          "TOTAL_BUYER_SPEND_PROVEN",

        feeEvidenceDetails:
          "Controlled test fixture explicitly defines the complete buyer spend and models no separate execution fee.",

        collateralToken:
          input.collateral ||
          input.availableCollateralToken ||
          ethers.ZeroAddress,

        previewTimestampMs:
          Date.now(),

        previewSource:
          "THETANUTS_OPTIONBOOK_PREVIEW",

        rawPreviewData: {
          maker:
            input.maker ||
            input.makerAddress,

          expiry:
            input.expiry ||
            input.expiryTimestampMs,

          numContracts: (
            requested /
            OPTIONBOOK_CONTRACT_SCALE
          ).toString(),

          fixtureMode: true,
        },
      };
    } catch {
      return null;
    }
  }

  private resolveCollateralDecimals(
    collateralAddress?: string
  ): number | undefined {
    if (
      !this.client ||
      !collateralAddress
    ) {
      return undefined;
    }

    try {
      const optionBook =
        this.client
          .optionBook as any;

      if (
        typeof optionBook
          ?.getCollateralDecimals ===
        "function"
      ) {
        const decimals =
          optionBook.getCollateralDecimals(
            collateralAddress
          );

        if (
          typeof decimals ===
          "number" &&
          Number.isInteger(decimals)
        ) {
          return decimals;
        }
      }
    } catch {
      // Continue to chain configuration.
    }

    const address =
      collateralAddress.toLowerCase();

    const tokens =
      this.client.chainConfig
        .tokens as any;

    const matches = (
      token: any
    ): boolean =>
      Boolean(
        token?.address &&
        token.address.toLowerCase() ===
        address
      );

    if (
      matches(tokens.USDC) ||
      matches(tokens.aBasUSDC)
    ) {
      return 6;
    }

    if (
      matches(tokens.WETH) ||
      matches(tokens.aBasWETH)
    ) {
      return 18;
    }

    if (
      matches(tokens.cbBTC) ||
      matches(tokens.aBascbBTC)
    ) {
      return 8;
    }

    return undefined;
  }

  private resolveRFQUnderlying(
    rfq: any
  ): string {
    if (!this.client || !rfq) {
      return "UNDERLYING_NOT_RESOLVED";
    }

    const feedAddress =
      String(
        rfq.collateralPriceFeed ||
        rfq.priceFeed ||
        ""
      ).toLowerCase();

    if (!feedAddress) {
      return "UNDERLYING_NOT_RESOLVED";
    }

    const feeds =
      this.client.chainConfig
        .priceFeeds as any;

    const matches = (
      feed: any
    ): boolean =>
      Boolean(
        feed &&
        String(feed).toLowerCase() ===
        feedAddress
      );

    if (
      matches(feeds.ETH) ||
      matches(feeds["ETH/USD"])
    ) {
      return "ETH";
    }

    if (
      matches(feeds.BTC) ||
      matches(feeds["BTC/USD"])
    ) {
      return "BTC";
    }

    if (
      matches(feeds.SOL) ||
      matches(feeds["SOL/USD"])
    ) {
      return "SOL";
    }

    return "UNDERLYING_NOT_RESOLVED";
  }

  private resolveRFQOptionRight(
    rfq: any
  ): "PUT" | "CALL" | null {
    if (!rfq) {
      return null;
    }

    if (
      rfq.optionType !==
      undefined &&
      rfq.optionType !== null
    ) {
      const optionType =
        Number(rfq.optionType);

      if (optionType === 1) {
        return "PUT";
      }

      if (optionType === 0) {
        return "CALL";
      }
    }

    if (
      !this.client ||
      !rfq.implementation
    ) {
      return null;
    }

    const implementations =
      (this.client.chainConfig as any)
        .optionImplementations;

    if (!implementations) {
      return null;
    }

    const implementation =
      implementations[
      String(
        rfq.implementation
      ).toLowerCase()
      ];

    const name =
      String(
        implementation?.name || ""
      ).toUpperCase();

    if (
      name === "PUT" ||
      name.includes(
        "PUT_SPREAD"
      ) ||
      name.includes(
        "PHYSICAL_PUT"
      )
    ) {
      return "PUT";
    }

    if (
      name === "CALL" ||
      name.includes(
        "CALL_SPREAD"
      ) ||
      name.includes(
        "PHYSICAL_CALL"
      )
    ) {
      return "CALL";
    }

    return null;
  }

  private resolveRFQImplementationName(
    rfq: any
  ): string | undefined {
    if (
      !this.client ||
      !rfq?.implementation
    ) {
      return undefined;
    }

    const implementations =
      (this.client.chainConfig as any)
        .optionImplementations;

    if (!implementations) {
      return undefined;
    }

    return implementations[
      String(
        rfq.implementation
      ).toLowerCase()
    ]?.name;
  }

  public getMarketStateSync():
    MarketStateRecord {
    return {
      ...this.marketState,
    };
  }

  public async getMarketState():
    Promise<MarketStateRecord> {
    try {
      if (!this.client) {
        this.initializeClient();
      }

      if (!this.client) {
        return {
          ...this.marketState,
        };
      }

      const [orders, spotEth] =
        await Promise.all([
          this.fetchRawOrders(),
          this.getSpotPrice("ETH"),
        ]);

      this.marketState.spotPriceUSD =
        spotEth;

      this.marketState.status =
        orders.length === 0
          ? "VERIFIED_EMPTY_ORDERBOOK"
          : "LIVE_READ_AVAILABLE";

      this.marketState.error =
        undefined;

      this.marketState.timestampMs =
        Date.now();

      return {
        ...this.marketState,
      };
    } catch (error) {
      this.marketState.status =
        this.isRateLimitError(error)
          ? "RATE_LIMITED"
          : "LIVE_READ_FAILED";

      this.marketState.error =
        this.marketState.status ===
          "RATE_LIMITED"
          ? "Live Thetanuts market read was rate limited"
          : "Live Thetanuts market read failed";

      this.marketState.timestampMs =
        Date.now();

      delete this.marketState
        .spotPriceUSD;

      return {
        ...this.marketState,
      };
    }
  }

  public resolveUnderlying(
    input: any
  ): string {
    if (!this.client) {
      return "UNDERLYING_NOT_RESOLVED";
    }

    const rawOrder =
      this.unwrapOptionBookOrder(
        input
      ) || input;

    const feeds =
      this.client.chainConfig
        .priceFeeds as any;

    const orderFeed =
      String(
        rawOrder?.rawApiData
          ?.priceFeed ||
        rawOrder?.priceFeed ||
        ""
      ).toLowerCase();

    if (orderFeed) {
      const matches = (
        feed: any
      ): boolean =>
        Boolean(
          feed &&
          String(feed).toLowerCase() ===
          orderFeed
        );

      if (
        matches(feeds.ETH) ||
        matches(feeds["ETH/USD"])
      ) {
        return "ETH";
      }

      if (
        matches(feeds.BTC) ||
        matches(feeds["BTC/USD"])
      ) {
        return "BTC";
      }

      if (
        matches(feeds.SOL) ||
        matches(feeds["SOL/USD"])
      ) {
        return "SOL";
      }
    }

    const ticker =
      rawOrder?.ticker ||
      rawOrder?.rawApiData
        ?.ticker;

    if (
      ticker &&
      typeof ticker === "string"
    ) {
      try {
        const parsed =
          (this.client.utils as any)
            .parseTicker?.(ticker);

        if (parsed?.underlying) {
          return this.normalizeAssetSymbol(
            parsed.underlying
          );
        }
      } catch {
        // Continue to collateral mapping.
      }
    }

    const collateral =
      String(
        rawOrder?.rawApiData
          ?.collateral ||
        rawOrder?.collateral ||
        ""
      ).toLowerCase();

    const tokens =
      this.client.chainConfig
        .tokens as any;

    const matchesToken = (
      token: any
    ): boolean =>
      Boolean(
        token?.address &&
        token.address.toLowerCase() ===
        collateral
      );

    if (
      matchesToken(tokens.WETH) ||
      matchesToken(
        tokens.aBasWETH
      )
    ) {
      return "ETH";
    }

    if (
      matchesToken(tokens.cbBTC) ||
      matchesToken(
        tokens.aBascbBTC
      )
    ) {
      return "BTC";
    }

    return "UNDERLYING_NOT_RESOLVED";
  }

  public async getSpotPrice(
    asset: string
  ): Promise<number> {
    const symbol =
      this.normalizeAssetSymbol(
        asset
      );

    const now = Date.now();

    if (
      this.spotPricesCache[
      symbol
      ] !== undefined &&
      now - this.lastFetchTimeMs <
      15_000
    ) {
      return this.spotPricesCache[
        symbol
      ];
    }

    if (
      !this.client ||
      !this.rpcUrl
    ) {
      throw new Error(
        "Live Thetanuts market data is unavailable"
      );
    }

    try {
      const timeoutPromise =
        new Promise<never>(
          (_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Market data timeout"
                  )
                ),
              3_000
            )
        );

      const data =
        await Promise.race([
          this.client.api.getMarketData(),
          timeoutPromise,
        ]);

      if (data?.prices) {
        if (
          data.prices.ETH !==
          undefined
        ) {
          this.spotPricesCache.ETH =
            Number(data.prices.ETH);
        }

        if (
          data.prices.BTC !==
          undefined
        ) {
          this.spotPricesCache.BTC =
            Number(data.prices.BTC);
        }

        if (
          data.prices.SOL !==
          undefined
        ) {
          this.spotPricesCache.SOL =
            Number(data.prices.SOL);
        }
      }

      this.lastFetchTimeMs = now;

      const resolvedPrice =
        this.spotPricesCache[
        symbol
        ];

      if (
        resolvedPrice !==
        undefined &&
        Number.isFinite(
          resolvedPrice
        ) &&
        resolvedPrice > 0
      ) {
        this.marketState.status =
          "LIVE_READ_AVAILABLE";

        this.marketState.error =
          undefined;

        return resolvedPrice;
      }

      throw new Error(
        "Requested live spot price unavailable"
      );
    } catch (error) {
      /*
       * Never silently reuse an old spot value.
       */
      const cached =
        this.spotPricesCache[
        symbol
        ];

      if (
        cached !== undefined &&
        Number.isFinite(cached) &&
        cached > 0 &&
        Date.now() -
        this.lastFetchTimeMs <
        15_000
      ) {
        return cached;
      }

      this.marketState.status =
        this.isRateLimitError(error)
          ? "RATE_LIMITED"
          : "LIVE_READ_FAILED";

      this.marketState.error =
        this.marketState.status ===
          "RATE_LIMITED"
          ? `Live market spot price rate limited for ${symbol}`
          : `Live market spot price unavailable for ${symbol}`;

      throw error instanceof Error
        ? error
        : new Error(
          `Live market spot price unavailable for ${symbol}`
        );
    }
  }

  public async fetchRawOrders():
    Promise<any[]> {
    if (!this.client) {
      throw new Error(
        "Thetanuts market client is unavailable"
      );
    }

    try {
      const timeoutPromise =
        new Promise<never>(
          (_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "OptionBook read timeout"
                  )
                ),
              3_000
            )
        );

      const orders =
        await Promise.race([
          this.client.api.fetchOrders(),
          timeoutPromise,
        ]);

      this.marketState.orderCount =
        orders.length;

      this.marketState.status =
        orders.length === 0
          ? "VERIFIED_EMPTY_ORDERBOOK"
          : "LIVE_READ_AVAILABLE";

      this.marketState.error =
        undefined;

      this.marketState.timestampMs =
        Date.now();

      return orders;
    } catch (error) {
      this.marketState.status =
        this.isRateLimitError(error)
          ? "RATE_LIMITED"
          : "LIVE_READ_FAILED";

      this.marketState.error =
        this.marketState.status ===
          "RATE_LIMITED"
          ? "Live OptionBook read was rate limited"
          : "Live OptionBook read failed";

      this.marketState.timestampMs =
        Date.now();

      throw error instanceof Error
        ? error
        : new Error(
          this.marketState.error
        );
    }
  }

  public calculateMaxContracts(
    input: any
  ): bigint {
    const rawOrder =
      this.unwrapOptionBookOrder(
        input
      );

    if (
      rawOrder &&
      this.client?.optionBook
        ?.calculateMaxContracts
    ) {
      try {
        return this.client.optionBook.calculateMaxContracts(
          rawOrder
        );
      } catch {
        return 0n;
      }
    }

    return this.calculateFixtureMaxContracts(
      input
    );
  }

  public async previewFill(
    input: any,
    requestedContracts18?: bigint
  ): Promise<PremiumPreview> {
    const rawOrder =
      this.unwrapOptionBookOrder(
        input
      );

    if (
      rawOrder &&
      this.client?.optionBook
        ?.previewFillOrder
    ) {
      try {
        let usdcAmount:
          | bigint
          | undefined;

        if (
          requestedContracts18 !==
          undefined &&
          requestedContracts18 > 0n
        ) {
          if (
            requestedContracts18 %
            OPTIONBOOK_CONTRACT_SCALE !==
            0n
          ) {
            return this.buildPreviewFailure(
              "Requested protection quantity cannot be represented exactly in OptionBook contract precision"
            );
          }

          const requestedContracts6 =
            requestedContracts18 /
            OPTIONBOOK_CONTRACT_SCALE;

          const pricePerContract8 =
            BigInt(
              rawOrder.order?.price ||
              0n
            );

          if (
            requestedContracts6 <=
            0n ||
            pricePerContract8 <= 0n
          ) {
            return this.buildPreviewFailure(
              "Verified OptionBook pricing data is unavailable"
            );
          }

          usdcAmount =
            usdc6ForContracts6(
              requestedContracts6,
              pricePerContract8
            );
        }

        const previewResult =
          this.client.optionBook.previewFillOrder(
            rawOrder,
            usdcAmount
          );

        if (
          !previewResult ||
          previewResult
            .pricePerContract ===
          undefined ||
          previewResult
            .totalCollateral ===
          undefined
        ) {
          return this.buildPreviewFailure(
            "Thetanuts OptionBook preview returned incomplete data"
          );
        }

        const pricePerContract =
          BigInt(
            previewResult
              .pricePerContract
          );

        const totalCost =
          BigInt(
            previewResult
              .totalCollateral
          );

        if (
          requestedContracts18 !==
          undefined
        ) {
          if (
            requestedContracts18 %
            OPTIONBOOK_CONTRACT_SCALE !==
            0n
          ) {
            return this.buildPreviewFailure(
              "Requested quantity is not exactly representable in OptionBook 6-decimal contract units"
            );
          }

          const expectedContracts6 =
            requestedContracts18 /
            OPTIONBOOK_CONTRACT_SCALE;

          const previewContracts6 =
            BigInt(
              previewResult
                .numContracts ??
              -1n
            );

          if (
            previewContracts6 !==
            expectedContracts6
          ) {
            return this.buildPreviewFailure(
              `Preview quantity mismatch: requested ${expectedContracts6.toString()} but SDK preview resolved ${previewContracts6.toString()} contract base units`
            );
          }
        }

        return {
          previewStatus:
            "PREVIEW_AVAILABLE",

          pricePerContract: {
            amountBaseUnits:
              pricePerContract.toString(),
            decimals: 8,
            symbol: "USD",
          },

          premiumAmount: {
            amountBaseUnits:
              totalCost.toString(),
            decimals: 6,
            symbol: "USDC",
          },

          /*
           * Zero here is a display placeholder only.
           * feeStatus explicitly says the fee
           * breakdown is incomplete.
           */
          protocolFee: {
            amountBaseUnits: "0",
            decimals: 6,
            symbol: "USDC",
          },

          referrerFee: {
            amountBaseUnits: "0",
            decimals: 6,
            symbol: "USDC",
          },

          totalExpectedCost: {
            amountBaseUnits:
              totalCost.toString(),
            decimals: 6,
            symbol: "USDC",
          },

          feeStatus: "INCOMPLETE",

          buyerSpendStatus:
            "VERIFIED",

          buyerSpendVerificationMode:
            "TOTAL_BUYER_SPEND_PROVEN",

          feeEvidenceDetails:
            "The SDK preview and encodeFillOrder bind the exact USDC fill amount supplied by the taker. The installed SDK does not independently prove a complete buyer execution-fee breakdown, so feeStatus remains INCOMPLETE.",

          collateralToken:
            previewResult
              .collateralToken,

          previewTimestampMs:
            Date.now(),

          previewSource:
            "THETANUTS_OPTIONBOOK_PREVIEW",

          rawPreviewData: {
            maker:
              previewResult.maker,

            expiry:
              previewResult.expiry?.toString(),

            numContracts:
              previewResult
                .numContracts?.toString(),

            maxContracts:
              previewResult
                .maxContracts?.toString(),

            isCall:
              previewResult.isCall,

            optionType:
              (previewResult as any).optionType ??
              (previewResult.isCall === false
                ? 1
                : previewResult.isCall === true
                  ? 0
                  : undefined),

            strikes:
              previewResult.strikes?.map(
                (strike: bigint) =>
                  strike.toString()
              ),
          },
        };
      } catch {
        return this.buildPreviewFailure(
          "Thetanuts OptionBook preview failed"
        );
      }
    }

    const fixturePreview =
      this.buildControlledFixturePreview(
        input,
        requestedContracts18
      );

    if (fixturePreview) {
      return fixturePreview;
    }

    return this.buildPreviewFailure(
      "Original OptionBook order evidence is unavailable"
    );
  }

  public async fetchMarketQuotes(
    intent: TypedRiskIntent
  ): Promise<MarketQuote[]> {
    const rawOrders =
      await this.fetchRawOrders();

    const targetAsset =
      this.normalizeAssetSymbol(
        intent.asset.value
      );

    const quotes: MarketQuote[] = [];

    const supportedImplementations =
      this.getSupportedVanillaPutImplementations();

    let fallbackIndex = 0;

    for (const rawOrder of rawOrders) {
      fallbackIndex += 1;

      const eligibility =
        OptionBookOrderEligibilityEngine.evaluate(
          rawOrder,
          supportedImplementations
        );

      if (!eligibility.eligible) {
        continue;
      }

      const underlying =
        this.resolveUnderlying(
          rawOrder
        );

      if (
        underlying !== targetAsset
      ) {
        continue;
      }

      /*
       * Eligibility already proves PUT.
       * Do not depend on normalized.isCall,
       * because current SDK normalization
       * may expose optionType instead.
       */
      const optionRight =
        this.resolveOrderOptionRight(
          rawOrder
        );

      if (optionRight !== "PUT") {
        continue;
      }

      const rawApiData =
        rawOrder.rawApiData;

      const strikes =
        this.getRawStrikes(
          rawOrder
        );

      if (strikes.length !== 1) {
        continue;
      }

      const optionExpirySeconds =
        Number(
          rawOrder.order?.expiry ??
          rawApiData?.expiry ??
          0
        );

      if (
        !Number.isFinite(
          optionExpirySeconds
        ) ||
        optionExpirySeconds <= 0
      ) {
        continue;
      }

      let availableAmount = 0n;

      try {
        availableAmount =
          BigInt(
            rawOrder
              .availableAmount ??
            0
          );
      } catch {
        continue;
      }

      const collateralAddress =
        rawApiData?.collateral ||
        rawOrder.order
          ?.collateralToken;

      const collateralDecimals =
        this.resolveCollateralDecimals(
          collateralAddress
        );

      if (
        collateralDecimals ===
        undefined
      ) {
        continue;
      }

      const orderValiditySeconds =
        Number(
          rawApiData
            ?.orderExpiryTimestamp ??
          rawOrder.order
            ?.orderExpiryTimestamp ??
          0
        );

      const nowSeconds =
        Math.floor(
          Date.now() / 1000
        );

      /*
       * Strictly fail closed.
       * A missing/zero order deadline is not
       * treated as indefinitely valid.
       */
      const orderStillValid =
        Number.isFinite(
          orderValiditySeconds
        ) &&
        orderValiditySeconds >
        nowSeconds;

      const optionNotExpired =
        optionExpirySeconds >
        nowSeconds;

      const executableNow =
        availableAmount > 0n &&
        orderStillValid &&
        optionNotExpired;

      if (!executableNow) {
        continue;
      }

      const rawIndex =
        rawApiData?.index;

      const orderIndex =
        typeof rawIndex ===
          "number"
          ? rawIndex
          : fallbackIndex;

      const implementationAddress =
        String(
          rawApiData
            ?.implementation ||
          rawOrder.order
            ?.implementation ||
          ""
        );

      const implementation =
        supportedImplementations.find(
          (item) =>
            item.address.toLowerCase() ===
            implementationAddress.toLowerCase()
        );

      quotes.push({
        quoteId:
          `ob-quote-${orderIndex}`,

        sourceType:
          "OPTION_BOOK",

        protocol: "THETANUTS",

        asset: underlying,

        optionRight: "PUT",

        strikePrice: {
          amountBaseUnits:
            strikes[0],
          decimals: 8,
          symbol: "USD",
        },

        expiryTimestampMs:
          optionExpirySeconds *
          1000,

        premium: {
          amountBaseUnits: "0",
          decimals:
            collateralDecimals,
          symbol: "USDC",
        },

        /*
         * This remains raw collateral/capacity
         * evidence. Never treat it directly as
         * option contracts.
         */
        availableQuantity: {
          amountBaseUnits:
            availableAmount.toString(),
          decimals:
            collateralDecimals,
          symbol: "USDC",
        },

        availableCollateralToken:
          collateralAddress,

        executableNow: true,

        makerAddress:
          rawOrder.makerAddress ||
          rawOrder.order?.maker,

        orderIndex,

        rawApiData: rawOrder,

        allStrikes:
          strikes.map(
            (strike) => ({
              amountBaseUnits:
                strike,
              decimals: 8,
              symbol: "USD",
            })
          ),

        implementationAddress,

        implementationName:
          implementation?.name,

        makerIsSeller:
          rawApiData?.isLong ===
          true,

        rawOrderIsLong:
          rawApiData?.isLong,

        normalizedOptionType:
          "PUT",

        rawOptionType:
          this.resolveRawOptionTypeEvidence(
            rawOrder
          ),

        orderValidityDeadlineMs:
          orderValiditySeconds *
          1000,

        eligibilityEvidence:
          eligibility.evidence,
      });
    }

    return quotes;
  }

  public async fetchMarketSnapshot(
    asset: string
  ): Promise<MarketSnapshotEvidence> {
    const capturedAtMs =
      Date.now();

    const snapshotId =
      `market-${capturedAtMs}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;

    if (!this.rpcUrl) {
      const unavailable:
        Omit<
          MarketSnapshotEvidence,
          "snapshotDigest"
        > = {
        snapshotId,
        chainId: 8453,
        status: "NOT_CONFIGURED",
        source:
          "THETANUTS_OPTIONBOOK_API",
        capturedAtMs,
        spotPrice: null,
        rawOrderCount: 0,
        eligibleOrderCount: 0,
        rejectedOrderCount: 0,
        quotes: [],
        rejectionReasons: [],
        error:
          "BASE_RPC_URL is not configured; live market evidence was not requested.",
      };

      return {
        ...unavailable,
        snapshotDigest:
          sha256Digest(
            unavailable
          ),
      };
    }

    try {
      const intentLike = {
        asset: {
          value: asset,
        },
      } as TypedRiskIntent;

      const quotes =
        await this.fetchMarketQuotes(
          intentLike
        );

      const rawOrderCount =
        this.marketState.orderCount;

      const currentStatus =
        this.marketState.status;

      if (
        currentStatus ===
        "RATE_LIMITED"
      ) {
        throw new Error(
          "RATE_LIMITED"
        );
      }

      const orderStatus:
        MarketStatus =
        rawOrderCount === 0
          ? "VERIFIED_EMPTY_ORDERBOOK"
          : "LIVE_READ_AVAILABLE";

      const spot =
        await this.getSpotPrice(
          asset
        );

      const spotFixed =
        spot.toFixed(8);

      const [
        integerPart,
        fractionalPart = "",
      ] = spotFixed.split(".");

      const spotPrice8 =
        BigInt(
          `${integerPart}${fractionalPart.padEnd(
            8,
            "0"
          )}`
        );

      const snapshot:
        Omit<
          MarketSnapshotEvidence,
          "snapshotDigest"
        > = {
        snapshotId,

        chainId: 8453,

        status: orderStatus,

        source:
          "THETANUTS_OPTIONBOOK_API",

        capturedAtMs,

        spotPrice: {
          amountBaseUnits:
            spotPrice8.toString(),
          decimals: 8,
          symbol: "USD",
        },

        rawOrderCount,

        eligibleOrderCount:
          quotes.length,

        rejectedOrderCount:
          Math.max(
            0,
            rawOrderCount -
            quotes.length
          ),

        quotes,

        rejectionReasons:
          rawOrderCount >
            quotes.length
            ? [
              {
                orderReference:
                  "FILTERED_ORDERS",
                reasons: [
                  "Orders were excluded by asset, taker direction, normalized PUT semantics, vanilla single-strike implementation, deadline, expiry, or positive maker-capacity gates.",
                ],
              },
            ]
            : [],
      };

      return {
        ...snapshot,
        snapshotDigest:
          sha256Digest(snapshot),
      };
    } catch (error) {
      const rateLimited =
        this.marketState.status ===
        "RATE_LIMITED" ||
        this.isRateLimitError(
          error
        ) ||
        String(
          (error as any)?.message
        ) === "RATE_LIMITED";

      const failed:
        Omit<
          MarketSnapshotEvidence,
          "snapshotDigest"
        > = {
        snapshotId,

        chainId: 8453,

        status: rateLimited
          ? "RATE_LIMITED"
          : "LIVE_READ_FAILED",

        source:
          "THETANUTS_OPTIONBOOK_API",

        capturedAtMs,

        spotPrice: null,

        rawOrderCount: 0,

        eligibleOrderCount: 0,

        rejectedOrderCount: 0,

        quotes: [],

        rejectionReasons: [],

        error: rateLimited
          ? "Live Thetanuts market access was rate limited."
          : error instanceof Error
            ? error.message
            : "Live market read failed",
      };

      return {
        ...failed,
        snapshotDigest:
          sha256Digest(failed),
      };
    }
  }

  public getOptionFactoryAddress():
    string {
    if (!this.client) {
      this.initializeClient();
    }

    return (
      this.client?.chainConfig
        ?.contracts
        ?.optionFactory || ""
    );
  }

  public getOptionBookAddress():
    string {
    if (!this.client) {
      this.initializeClient();
    }

    return (
      this.client?.chainConfig
        ?.contracts
        ?.optionBook || ""
    );
  }

  public async encodeExactFill(
    quote: MarketQuote,
    requestedContracts18: bigint,
    referrer = ethers.ZeroAddress
  ): Promise<ExactFillEncoding> {
    if (
      !this.client?.optionBook
    ) {
      throw new Error(
        "Thetanuts OptionBook SDK is unavailable"
      );
    }

    const rawOrder =
      this.unwrapOptionBookOrder(
        quote
      );

    if (!rawOrder) {
      throw new Error(
        "Original signed OptionBook order evidence is unavailable"
      );
    }

    const eligibility =
      OptionBookOrderEligibilityEngine.evaluate(
        rawOrder,
        this.getSupportedVanillaPutImplementations()
      );

    if (
      !eligibility.eligible ||
      quote.executableNow !== true
    ) {
      throw new Error(
        "Order no longer passes protective long-put eligibility"
      );
    }

    if (
      requestedContracts18 <= 0n ||
      requestedContracts18 %
      OPTIONBOOK_CONTRACT_SCALE !==
      0n
    ) {
      throw new Error(
        "Requested quantity is not exactly representable in OptionBook contract units"
      );
    }

    const numContracts6 =
      requestedContracts18 /
      OPTIONBOOK_CONTRACT_SCALE;

    const maxContracts6 =
      this.calculateMaxContracts(
        rawOrder
      );

    if (
      numContracts6 >
      maxContracts6
    ) {
      throw new Error(
        "Maker capacity is insufficient for exact quantity"
      );
    }

    const price8 =
      BigInt(
        rawOrder.order?.price ??
        0n
      );

    if (price8 <= 0n) {
      throw new Error(
        "Signed order price is unavailable"
      );
    }

    const buyerSpendUSDC6 =
      usdc6ForContracts6(
        numContracts6,
        price8
      );

    const preview =
      await this.previewFill(
        quote,
        requestedContracts18
      );

    if (
      preview.previewStatus !==
      "PREVIEW_AVAILABLE" ||
      preview.buyerSpendStatus !==
      "VERIFIED" ||
      BigInt(
        preview.rawPreviewData
          ?.numContracts ??
        -1
      ) !== numContracts6 ||
      BigInt(
        preview.totalExpectedCost
          .amountBaseUnits
      ) !== buyerSpendUSDC6
    ) {
      throw new Error(
        "SDK preview does not exactly match requested quantity and buyer spend"
      );
    }

    const encoded =
      this.client.optionBook.encodeFillOrder(
        rawOrder,
        buyerSpendUSDC6,
        referrer
      );

    const canonicalOptionBook =
      this.getOptionBookAddress();

    if (
      !canonicalOptionBook ||
      encoded.to.toLowerCase() !==
      canonicalOptionBook.toLowerCase()
    ) {
      throw new Error(
        "Encoded transaction target does not match canonical SDK OptionBook address"
      );
    }

    return {
      ...encoded,
      buyerSpendUSDC6,
      numContracts6,
      rawOrder,
      preview,
    };
  }

  /**
   * Pre-sign TOCTOU revalidation.
   *
   * This performs a NEW live market read immediately before the
   * external wallet authorization step and proves that the exact
   * previously selected signed order is still usable.
   *
   * It never signs or broadcasts anything.
   */
  public async revalidateExactFill(
    params: {
      originalQuote: MarketQuote;
      requestedContracts18: bigint;
      expectedBuyerSpendUSDC6: bigint;
      maxSpendUSDC6: bigint;
      expectedCalldataHash: string;
      expectedTarget?: string;
      referrer?: string;
    }
  ): Promise<ExactFillRevalidationResult> {
    const checkedAtMs =
      Date.now();

    const checks:
      PreSignRevalidationCheck[] = [];

    const blockers: string[] = [];

    const add = (
      check:
        PreSignRevalidationCheck["check"],
      passed: boolean,
      details: string
    ): void => {
      checks.push({
        check,
        passed,
        details,
      });

      if (!passed) {
        blockers.push(
          `${check}: ${details}`
        );
      }
    };

    const originalRawOrder =
      this.unwrapOptionBookOrder(
        params.originalQuote
      );

    if (!originalRawOrder) {
      return {
        status:
          "EVIDENCE_MISMATCH",
        checkedAtMs,
        checks: [
          {
            check:
              "ORDER_IDENTITY",
            passed: false,
            details:
              "Original signed OptionBook order evidence is unavailable.",
          },
        ],
        blockers: [
          "Original signed OptionBook order evidence is unavailable.",
        ],
        explanation:
          "The prepared action cannot be revalidated because the original signed order evidence is missing.",
      };
    }

    const originalIdentity =
      this.getOrderIdentityDigest(
        originalRawOrder
      );

    const snapshot =
      await this.fetchMarketSnapshot(
        params.originalQuote.asset
      );

    if (
      snapshot.status ===
      "RATE_LIMITED" ||
      snapshot.status ===
      "LIVE_READ_FAILED" ||
      snapshot.status ===
      "NOT_CONFIGURED" ||
      snapshot.status ===
      "STALE"
    ) {
      add(
        "CHAIN",
        false,
        `Fresh live market evidence is unavailable (${snapshot.status}).`
      );

      return {
        status:
          "MARKET_UNAVAILABLE",
        checkedAtMs,
        snapshot,
        checks,
        blockers,
        explanation:
          "Pre-sign revalidation failed closed because fresh live market evidence is unavailable.",
      };
    }

    add(
      "CHAIN",
      snapshot.chainId ===
      8453,
      snapshot.chainId === 8453
        ? "Fresh market evidence is from Base chain 8453."
        : "Fresh market evidence is not from Base chain 8453."
    );

    const freshQuote =
      snapshot.quotes.find(
        (quote) => {
          const freshRaw =
            this.unwrapOptionBookOrder(
              quote
            );

          if (!freshRaw) {
            return false;
          }

          return (
            this.getOrderIdentityDigest(
              freshRaw
            ) === originalIdentity
          );
        }
      );

    if (!freshQuote) {
      add(
        "ORDER_IDENTITY",
        false,
        "The exact previously selected signed OptionBook order is no longer present in the fresh executable-order set."
      );

      return {
        status:
          "ORDER_NOT_FOUND",
        checkedAtMs,
        snapshot,
        checks,
        blockers,
        explanation:
          "The previously reviewed signed order is no longer available. The old preparation must not proceed to wallet authorization.",
      };
    }

    add(
      "ORDER_IDENTITY",
      true,
      "The exact previously selected signed OptionBook order was observed again in the fresh market read."
    );

    const freshRaw =
      this.unwrapOptionBookOrder(
        freshQuote
      );

    if (!freshRaw) {
      add(
        "ORDER_IDENTITY",
        false,
        "Fresh quote does not contain the original signed-order evidence."
      );

      return {
        status:
          "EVIDENCE_MISMATCH",
        checkedAtMs,
        snapshot,
        freshQuote,
        checks,
        blockers,
        explanation:
          "Fresh order evidence could not be reconstructed.",
      };
    }

    const originalSignature =
      String(
        originalRawOrder
          .signature || ""
      );

    const freshSignature =
      String(
        freshRaw.signature || ""
      );

    add(
      "ORDER_SIGNATURE",
      originalSignature.length >
      0 &&
      originalSignature ===
      freshSignature,
      originalSignature ===
        freshSignature
        ? "Maker signature is unchanged."
        : "Maker signature differs from the reviewed order."
    );

    add(
      "ORDER_DIRECTION",
      freshQuote.makerIsSeller ===
      true &&
      freshQuote
        .normalizedOptionType ===
      "PUT",
      freshQuote.makerIsSeller ===
        true &&
        freshQuote
          .normalizedOptionType ===
        "PUT"
        ? "Fresh order still represents maker-sells/taker-buys PUT protection."
        : "Fresh order direction or PUT semantics changed."
    );

    add(
      "ORDER_STRUCTURE",
      freshQuote.allStrikes
        ?.length === 1 &&
      freshQuote.optionRight ===
      "PUT",
      freshQuote.allStrikes
        ?.length === 1 &&
        freshQuote.optionRight ===
        "PUT"
        ? "Fresh order remains a single-strike PUT."
        : "Fresh order no longer satisfies the single-strike PUT structure."
    );

    const nowMs =
      Date.now();

    const orderDeadlineValid =
      Boolean(
        freshQuote
          .orderValidityDeadlineMs &&
        freshQuote
          .orderValidityDeadlineMs >
        nowMs
      );

    add(
      "ORDER_DEADLINE",
      orderDeadlineValid,
      orderDeadlineValid
        ? "Signed order deadline is still in the future."
        : "Signed order deadline is expired or unavailable."
    );

    const expiryValid =
      freshQuote
        .expiryTimestampMs >
      nowMs;

    add(
      "OPTION_EXPIRY",
      expiryValid,
      expiryValid
        ? "Option expiry remains in the future."
        : "Option expiry has passed."
    );

    const originalMaker =
      this.normalizeAddress(
        params.originalQuote
          .makerAddress
      );

    const freshMaker =
      this.normalizeAddress(
        freshQuote.makerAddress
      );

    add(
      "MAKER",
      originalMaker.length > 0 &&
      originalMaker ===
      freshMaker,
      originalMaker ===
        freshMaker
        ? "Maker identity is unchanged."
        : "Maker identity differs from the reviewed order."
    );

    add(
      "IMPLEMENTATION",
      this.normalizeAddress(
        params.originalQuote
          .implementationAddress
      ) ===
      this.normalizeAddress(
        freshQuote
          .implementationAddress
      ),
      this.normalizeAddress(
        params.originalQuote
          .implementationAddress
      ) ===
        this.normalizeAddress(
          freshQuote
            .implementationAddress
        )
        ? "Option implementation is unchanged."
        : "Option implementation differs from the reviewed order."
    );

    const originalStrikes =
      (
        params.originalQuote
          .allStrikes || []
      ).map(
        (strike) =>
          strike.amountBaseUnits
      );

    const freshStrikes =
      (
        freshQuote.allStrikes ||
        []
      ).map(
        (strike) =>
          strike.amountBaseUnits
      );

    add(
      "STRIKES",
      JSON.stringify(
        originalStrikes
      ) ===
      JSON.stringify(
        freshStrikes
      ),
      JSON.stringify(
        originalStrikes
      ) ===
        JSON.stringify(
          freshStrikes
        )
        ? "Full strike structure is unchanged."
        : "Strike structure differs from the reviewed order."
    );

    const originalRaw =
      originalRawOrder.rawApiData ||
      {};

    const freshRawApi =
      freshRaw.rawApiData || {};

    add(
      "PRICE_FEED",
      this.normalizeAddress(
        originalRaw.priceFeed
      ) ===
      this.normalizeAddress(
        freshRawApi.priceFeed
      ),
      this.normalizeAddress(
        originalRaw.priceFeed
      ) ===
        this.normalizeAddress(
          freshRawApi.priceFeed
        )
        ? "Price feed is unchanged."
        : "Price feed differs from the reviewed order."
    );

    add(
      "COLLATERAL",
      this.normalizeAddress(
        originalRaw.collateral
      ) ===
      this.normalizeAddress(
        freshRawApi.collateral
      ),
      this.normalizeAddress(
        originalRaw.collateral
      ) ===
        this.normalizeAddress(
          freshRawApi.collateral
        )
        ? "Collateral token is unchanged."
        : "Collateral token differs from the reviewed order."
    );

    const maxContracts6 =
      this.calculateMaxContracts(
        freshQuote
      );

    const quantityRepresentable =
      params.requestedContracts18 >
      0n &&
      params.requestedContracts18 %
      OPTIONBOOK_CONTRACT_SCALE ===
      0n;

    const requestedContracts6 =
      quantityRepresentable
        ? params.requestedContracts18 /
        OPTIONBOOK_CONTRACT_SCALE
        : -1n;

    add(
      "REQUESTED_QUANTITY",
      quantityRepresentable &&
      requestedContracts6 > 0n,
      quantityRepresentable &&
        requestedContracts6 > 0n
        ? "Requested quantity remains exactly representable in OptionBook contract precision."
        : "Requested quantity cannot be represented exactly in OptionBook contract precision."
    );

    const capacitySufficient =
      requestedContracts6 > 0n &&
      maxContracts6 >=
      requestedContracts6;

    add(
      "AVAILABLE_CAPACITY",
      capacitySufficient,
      capacitySufficient
        ? `Fresh maker capacity (${maxContracts6.toString()}) still covers the requested quantity (${requestedContracts6.toString()}) in 6-decimal contract units.`
        : `Fresh maker capacity (${maxContracts6.toString()}) is insufficient for the requested quantity (${requestedContracts6.toString()}).`
    );

    if (
      !orderDeadlineValid
    ) {
      return {
        status:
          "ORDER_EXPIRED",
        checkedAtMs,
        snapshot,
        freshQuote,
        refreshedMaxContracts6:
          maxContracts6,
        checks,
        blockers,
        explanation:
          "The signed order deadline is no longer valid. A new market selection is required.",
      };
    }

    if (!capacitySufficient) {
      return {
        status:
          "LIQUIDITY_CHANGED",
        checkedAtMs,
        snapshot,
        freshQuote,
        refreshedMaxContracts6:
          maxContracts6,
        checks,
        blockers,
        explanation:
          "Maker capacity changed and no longer supports the exact reviewed quantity.",
      };
    }

    let encoded:
      ExactFillEncoding;

    try {
      encoded =
        await this.encodeExactFill(
          freshQuote,
          params.requestedContracts18,
          params.referrer ??
          ethers.ZeroAddress
        );
    } catch (error) {
      add(
        "BUYER_SPEND",
        false,
        error instanceof Error
          ? error.message
          : "Exact refreshed fill could not be reconstructed."
      );

      return {
        status:
          "EVIDENCE_MISMATCH",
        checkedAtMs,
        snapshot,
        freshQuote,
        refreshedMaxContracts6:
          maxContracts6,
        checks,
        blockers,
        explanation:
          "Fresh exact fill reconstruction failed.",
      };
    }

    const spendMatches =
      encoded.buyerSpendUSDC6 ===
      params.expectedBuyerSpendUSDC6;

    add(
      "BUYER_SPEND",
      spendMatches,
      spendMatches
        ? "Fresh exact buyer spend is unchanged."
        : `Fresh buyer spend changed from ${params.expectedBuyerSpendUSDC6.toString()} to ${encoded.buyerSpendUSDC6.toString()} USDC base units.`
    );

    const withinMaximumSpend =
      encoded.buyerSpendUSDC6 <=
      params.maxSpendUSDC6;

    add(
      "MAX_SPEND",
      withinMaximumSpend,
      withinMaximumSpend
        ? "Fresh exact buyer spend remains within the confirmed maximum spend."
        : "Fresh exact buyer spend exceeds the confirmed maximum spend."
    );

    const freshCalldataHash =
      ethers.keccak256(
        encoded.data
      );

    const calldataMatches =
      freshCalldataHash.toLowerCase() ===
      params.expectedCalldataHash.toLowerCase();

    add(
      "CALLDATA",
      calldataMatches,
      calldataMatches
        ? "Fresh SDK encoding produces exactly the same calldata commitment."
        : "Fresh SDK encoding differs from the previously reviewed calldata."
    );

    const expectedTarget =
      params.expectedTarget
        ? this.normalizeAddress(
          params.expectedTarget
        )
        : this.normalizeAddress(
          this.getOptionBookAddress()
        );

    const targetMatches =
      this.normalizeAddress(
        encoded.to
      ) === expectedTarget;

    add(
      "SEMANTIC_DIGEST",
      targetMatches &&
      spendMatches &&
      calldataMatches,
      targetMatches &&
        spendMatches &&
        calldataMatches
        ? "Target, buyer spend, and exact calldata remain materially identical to the reviewed action."
        : "One or more material execution semantics changed."
    );

    if (!withinMaximumSpend) {
      return {
        status:
          "COST_EXCEEDS_LIMIT",
        checkedAtMs,
        snapshot,
        freshQuote,
        encoded,
        refreshedMaxContracts6:
          maxContracts6,
        checks,
        blockers,
        explanation:
          "Fresh buyer spend exceeds the user-confirmed maximum. The previous preparation is invalid.",
      };
    }

    if (!spendMatches) {
      return {
        status:
          "PRICE_CHANGED",
        checkedAtMs,
        snapshot,
        freshQuote,
        encoded,
        refreshedMaxContracts6:
          maxContracts6,
        checks,
        blockers,
        explanation:
          "Material buyer-spend evidence changed. The user must review a new preparation.",
      };
    }

    if (
      checks.some(
        (item) => !item.passed
      )
    ) {
      return {
        status:
          "EVIDENCE_MISMATCH",
        checkedAtMs,
        snapshot,
        freshQuote,
        encoded,
        refreshedMaxContracts6:
          maxContracts6,
        checks,
        blockers,
        explanation:
          "At least one material execution input changed. The old prepared action must not proceed.",
      };
    }

    return {
      status: "REVALIDATED",
      checkedAtMs,
      snapshot,
      freshQuote,
      encoded,
      refreshedMaxContracts6:
        maxContracts6,
      checks,
      blockers: [],
      explanation:
        "The exact signed order, direction, structure, deadline, maker capacity, buyer spend, target, and calldata were freshly revalidated. External human wallet authorization may now be requested.",
    };
  }

  /**
   * Use the SDK's canonical nonce computation when available.
   * This is read-only and never signs or broadcasts.
   */
  public computeOptionBookNonce(
    input: any
  ): string | null {
    if (!this.client?.optionBook) {
      return null;
    }

    const rawOrder =
      this.unwrapOptionBookOrder(
        input
      );

    if (!rawOrder) {
      return null;
    }

    const optionBook =
      this.client.optionBook as any;

    if (
      typeof optionBook
        .computeNonce !== "function"
    ) {
      return null;
    }

    try {
      const computed =
        optionBook.computeNonce(
          rawOrder
        );

      return String(computed);
    } catch {
      try {
        const computed =
          optionBook.computeNonce(
            rawOrder.order
          );

        return String(computed);
      } catch {
        return null;
      }
    }
  }

  public async getQuotationCount():
    Promise<bigint> {
    if (!this.client) {
      this.initializeClient();
    }

    if (
      !this.client ||
      !this.client.optionFactory
    ) {
      return 0n;
    }

    try {
      const timeoutPromise =
        new Promise<never>(
          (_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "RFQ count timeout"
                  )
                ),
              2_000
            )
        );

      return await Promise.race([
        this.client.optionFactory.getQuotationCount(),
        timeoutPromise,
      ]);
    } catch {
      return 0n;
    }
  }

  public async fetchExistingRFQs():
    Promise<any[]> {
    if (!this.client) {
      this.initializeClient();
    }

    if (
      !this.client ||
      !this.client.api
    ) {
      return [];
    }

    try {
      const timeoutPromise =
        new Promise<never>(
          (_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "RFQ read timeout"
                  )
                ),
              2_000
            )
        );

      return await Promise.race([
        this.client.api.getFactoryRfqs(),
        timeoutPromise,
      ]);
    } catch {
      return [];
    }
  }

  public async normalizeExistingRFQQuotes(
    intent: TypedRiskIntent
  ): Promise<RFQQuote[]> {
    const rawRfqs =
      await this.fetchExistingRFQs();

    const targetAsset =
      this.normalizeAssetSymbol(
        intent.asset.value
      );

    const quotes: RFQQuote[] = [];

    for (const rfq of rawRfqs) {
      const underlying =
        this.resolveRFQUnderlying(
          rfq
        );

      if (
        underlying !== targetAsset
      ) {
        continue;
      }

      const optionRight =
        this.resolveRFQOptionRight(
          rfq
        );

      if (
        optionRight !== "PUT"
      ) {
        continue;
      }

      const implementationName =
        this.resolveRFQImplementationName(
          rfq
        );

      const status =
        String(
          rfq.status || ""
        ).toLowerCase();

      let bestPrice = 0n;

      try {
        bestPrice =
          rfq.currentBestPrice
            ? BigInt(
              rfq.currentBestPrice
            )
            : 0n;
      } catch {
        bestPrice = 0n;
      }

      const baseFields = {
        quoteId:
          `rfq-quote-${rfq.id}`,

        rfqId:
          rfq.id?.toString() ||
          "unknown",

        maker:
          rfq.winner ||
          rfq.requester ||
          ethers.ZeroAddress,

        expiryTimestampMs:
          Number(
            rfq.expiryTimestamp ||
            0
          ) * 1000,

        strategyMetadata: {
          implementation:
            rfq.implementation,

          implementationName,

          optionType:
            rfq.optionType,

          strikes:
            rfq.strikes,

          status:
            rfq.status,

          underlying,
        },

        source:
          "THETANUTS_OPTIONFACTORY_RFQ" as const,

        timestampMs:
          Number(
            rfq.createdAt || 0
          ) * 1000,
      };

      if (bestPrice <= 0n) {
        if (status !== "active") {
          continue;
        }

        quotes.push({
          ...baseFields,

          pricingStatus:
            "NOT_AVAILABLE",

          quoteStatus:
            "PENDING_REVEAL",
        });

        continue;
      }

      const feeKnown =
        rfq.feeAmount !==
        undefined &&
        rfq.feeAmount !== null &&
        String(rfq.feeAmount) !==
        "";

      /*
       * Revealed RFQ cost is only represented
       * when fee information is explicitly known.
       * Unknown fee evidence is not silently
       * converted into a zero fee.
       */
      if (!feeKnown) {
        continue;
      }

      let feeAmount: bigint;

      try {
        feeAmount =
          BigInt(
            rfq.feeAmount
          );
      } catch {
        continue;
      }

      const totalExpectedCost =
        bestPrice + feeAmount;

      quotes.push({
        ...baseFields,

        pricingStatus:
          "AVAILABLE",

        quoteStatus:
          status === "active"
            ? "ACTIVE"
            : "EXPIRED",

        premium: {
          amountBaseUnits:
            bestPrice.toString(),
          decimals: 6,
          symbol: "USDC",
        },

        /*
         * The fee value was explicitly supplied
         * by RFQ evidence, including an explicit
         * zero when that is what the source says.
         */
        feeStatus: "VERIFIED",

        totalExpectedCost: {
          amountBaseUnits:
            totalExpectedCost.toString(),
          decimals: 6,
          symbol: "USDC",
        },
      });
    }

    return quotes;
  }
}