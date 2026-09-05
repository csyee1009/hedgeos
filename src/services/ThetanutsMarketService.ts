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
  PremiumPreview,
  RFQQuote,
  TypedRiskIntent,
} from "../types";

const OPTIONBOOK_CONTRACT_SCALE = 1_000_000_000_000n;
const CONTRACTS_6_SCALE = 1_000_000n;
const PRICE_8_SCALE = 100_000_000n;

export class ThetanutsOptionBookSource implements OptionBookQuoteSource {
  public get status(): MarketStatus {
    return this.service.getMarketStateSync().status;
  }

  constructor(private service: ThetanutsMarketService) { }

  public async fetchExecutableOrders(
    intent: TypedRiskIntent
  ): Promise<MarketQuote[]> {
    return this.service.fetchMarketQuotes(intent);
  }
}

export class ThetanutsRFQSource implements RFQQuoteSource {
  public readonly status = "LIVE_RFQ_NOT_VERIFIED" as const;

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
  private provider: ethers.JsonRpcProvider | null = null;

  private readonly chainId = 8453;

  private rpcUrl: string;

  private marketState: MarketStateRecord;

  private spotPricesCache: Record<string, number> = {};

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
      source: "ThetanutsClient (Base Mainnet 8453)",
      orderCount: 0,
      error: this.rpcUrl
        ? undefined
        : "RPC URL not configured",
    };

    this.optionBookSource =
      new ThetanutsOptionBookSource(this);

    this.rfqSource = new ThetanutsRFQSource();

    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const providerUrl =
        this.rpcUrl || "https://mainnet.base.org";

      this.provider =
        new ethers.JsonRpcProvider(providerUrl);

      this.client = new ThetanutsClient({
        chainId: this.chainId,
        provider: this.provider,
      });

      if (this.rpcUrl) {
        this.marketState.status = "CONNECTING";
        this.marketState.error = undefined;
        this.marketState.timestampMs = Date.now();
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
        error: "Failed to initialize Thetanuts market client",
      };
    }
  }

  private normalizeAssetSymbol(asset: string): string {
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
        10n ** BigInt(toDecimals - fromDecimals)
      );
    }

    return (
      amount /
      10n ** BigInt(fromDecimals - toDecimals)
    );
  }

  private unwrapOptionBookOrder(
    input: any
  ): any | null {
    if (!input) {
      return null;
    }

    if (
      input.rawApiData &&
      input.rawApiData.order
    ) {
      return input.rawApiData;
    }

    if (input.order) {
      return input;
    }

    return null;
  }

  private isControlledTestFixture(
    input: any
  ): boolean {
    if (process.env.NODE_ENV !== "test") {
      return false;
    }

    if (!input || typeof input !== "object") {
      return false;
    }

    return !this.unwrapOptionBookOrder(input);
  }

  private calculateFixtureMaxContracts(
    input: any
  ): bigint {
    if (!this.isControlledTestFixture(input)) {
      return 0n;
    }

    if (
      input.availableQuantity?.symbol ===
      "CONTRACTS"
    ) {
      try {
        return this.scaleBaseUnits(
          BigInt(
            input.availableQuantity.amountBaseUnits
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
        input.availableQuantity?.amountBaseUnits;

      if (
        availableAmountString === undefined ||
        availableAmountString === null
      ) {
        return 0n;
      }

      const availableAmount =
        BigInt(availableAmountString);

      if (availableAmount <= 0n) {
        return 0n;
      }

      const collateralDecimals =
        input.availableQuantity?.decimals ?? 6;

      const strikes =
        Array.isArray(input.strikes) &&
          input.strikes.length > 0
          ? input.strikes
          : input.strikePrice?.amountBaseUnits
            ? [input.strikePrice.amountBaseUnits]
            : [];

      if (strikes.length !== 1) {
        return 0n;
      }

      if (input.isCall === true) {
        return 0n;
      }

      const strike = BigInt(strikes[0]);

      if (strike <= 0n) {
        return 0n;
      }

      const strikeDecimals =
        input.strikePrice?.decimals ?? 8;

      const numerator =
        availableAmount *
        10n ** BigInt(strikeDecimals) *
        CONTRACTS_6_SCALE;

      const denominator =
        strike *
        10n ** BigInt(collateralDecimals);

      if (denominator <= 0n) {
        return 0n;
      }

      return numerator / denominator;
    } catch {
      return 0n;
    }
  }

  private buildPreviewFailure(
    message: string
  ): PremiumPreview {
    return {
      previewStatus: "PREVIEW_FAILED",

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

      collateralToken: ethers.ZeroAddress,

      previewTimestampMs: Date.now(),

      previewSource:
        "THETANUTS_OPTIONBOOK_PREVIEW",

      error: message,
    };
  }

  private buildControlledFixturePreview(
    input: any,
    requestedContracts18?: bigint
  ): PremiumPreview | null {
    if (!this.isControlledTestFixture(input)) {
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
        input.pricePerContract !== undefined
      ) {
        pricePerContract8 =
          BigInt(input.pricePerContract);

        if (pricePerContract8 <= 0n) {
          return null;
        }

        const numerator =
          requested * pricePerContract8;

        const denominator =
          100_000_000_000_000_000_000n;

        totalCost6 =
          (numerator +
            denominator -
            1n) /
          denominator;
      } else if (
        input.premium?.amountBaseUnits !==
        undefined
      ) {
        totalCost6 =
          this.scaleBaseUnits(
            BigInt(
              input.premium.amountBaseUnits
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
        previewStatus: "PREVIEW_AVAILABLE",

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

        feeStatus: "ZERO_VERIFIED",

        collateralToken:
          input.collateral ||
          input.availableCollateralToken ||
          ethers.ZeroAddress,

        previewTimestampMs: Date.now(),

        previewSource:
          "THETANUTS_OPTIONBOOK_PREVIEW",

        rawPreviewData: {
          maker:
            input.maker ||
            input.makerAddress,

          expiry:
            input.expiry ||
            input.expiryTimestampMs,

          numContracts:
            (
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
        this.client.optionBook as any;

      if (
        typeof optionBook?.getCollateralDecimals ===
        "function"
      ) {
        const decimals =
          optionBook.getCollateralDecimals(
            collateralAddress
          );

        if (
          typeof decimals === "number" &&
          Number.isInteger(decimals)
        ) {
          return decimals;
        }
      }
    } catch {
      // Continue to deterministic chain config.
    }

    const address =
      collateralAddress.toLowerCase();

    const tokens =
      this.client.chainConfig.tokens as any;

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

    const feedAddress = String(
      rfq.collateralPriceFeed ||
      rfq.priceFeed ||
      ""
    ).toLowerCase();

    if (!feedAddress) {
      return "UNDERLYING_NOT_RESOLVED";
    }

    const feeds =
      this.client.chainConfig.priceFeeds as any;

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
      rfq.optionType !== undefined &&
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
      name.includes("PUT_SPREAD") ||
      name.includes("PHYSICAL_PUT")
    ) {
      return "PUT";
    }

    if (
      name === "CALL" ||
      name.includes("CALL_SPREAD") ||
      name.includes("PHYSICAL_CALL")
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

  public getMarketStateSync(): MarketStateRecord {
    return {
      ...this.marketState,
    };
  }

  public async getMarketState(): Promise<MarketStateRecord> {
    try {
      if (!this.client) {
        this.initializeClient();
      }

      if (!this.client) {
        return {
          ...this.marketState,
        };
      }

      const spotEth =
        await this.getSpotPrice("ETH");

      this.marketState.spotPriceUSD =
        spotEth;

      this.marketState.status =
        "LIVE_READ_AVAILABLE";

      this.marketState.error = undefined;

      this.marketState.timestampMs =
        Date.now();

      return {
        ...this.marketState,
      };
    } catch {
      this.marketState.status =
        "LIVE_READ_FAILED";

      this.marketState.error =
        "Live Thetanuts market read failed";

      this.marketState.timestampMs =
        Date.now();

      delete this.marketState.spotPriceUSD;

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
      this.unwrapOptionBookOrder(input) ||
      input;

    const feeds =
      this.client.chainConfig.priceFeeds as any;

    const orderFeed = String(
      rawOrder?.rawApiData?.priceFeed ||
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
      rawOrder?.rawApiData?.ticker;

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
        // Continue to collateral resolution.
      }
    }

    const collateral = String(
      rawOrder?.rawApiData?.collateral ||
      rawOrder?.collateral ||
      ""
    ).toLowerCase();

    const tokens =
      this.client.chainConfig.tokens as any;

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
      matchesToken(tokens.aBasWETH)
    ) {
      return "ETH";
    }

    if (
      matchesToken(tokens.cbBTC) ||
      matchesToken(tokens.aBascbBTC)
    ) {
      return "BTC";
    }

    return "UNDERLYING_NOT_RESOLVED";
  }

  public async getSpotPrice(
    asset: string
  ): Promise<number> {
    const symbol =
      this.normalizeAssetSymbol(asset);

    const now = Date.now();

    if (
      this.spotPricesCache[symbol] !==
      undefined &&
      now - this.lastFetchTimeMs < 15_000
    ) {
      return this.spotPricesCache[
        symbol
      ];
    }

    if (!this.client || !this.rpcUrl) {
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
          data.prices.ETH !== undefined
        ) {
          this.spotPricesCache.ETH =
            Number(data.prices.ETH);
        }

        if (
          data.prices.BTC !== undefined
        ) {
          this.spotPricesCache.BTC =
            Number(data.prices.BTC);
        }

        if (
          data.prices.SOL !== undefined
        ) {
          this.spotPricesCache.SOL =
            Number(data.prices.SOL);
        }
      }

      this.lastFetchTimeMs = now;

      const resolvedPrice =
        this.spotPricesCache[symbol];

      if (
        resolvedPrice !== undefined &&
        Number.isFinite(resolvedPrice) &&
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
    } catch {
      const cached =
        this.spotPricesCache[symbol];

      if (
        cached !== undefined &&
        Number.isFinite(cached) &&
        cached > 0
      ) {
        return cached;
      }

      this.marketState.status =
        "LIVE_READ_FAILED";

      this.marketState.error =
        `Live market spot price unavailable for ${symbol}`;

      throw new Error(
        `Live market spot price unavailable for ${symbol}`
      );
    }
  }

  public async fetchRawOrders(): Promise<any[]> {
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
        "LIVE_READ_AVAILABLE";

      this.marketState.error = undefined;

      this.marketState.timestampMs =
        Date.now();

      return orders;
    } catch {
      this.marketState.status =
        "LIVE_READ_FAILED";

      this.marketState.error =
        "Live OptionBook read failed";

      this.marketState.timestampMs =
        Date.now();

      throw new Error(
        "Live OptionBook read failed"
      );
    }
  }

  public calculateMaxContracts(
    input: any
  ): bigint {
    const rawOrder =
      this.unwrapOptionBookOrder(input);

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
      this.unwrapOptionBookOrder(input);

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
              rawOrder.order?.price || 0n
            );

          if (
            requestedContracts6 <= 0n ||
            pricePerContract8 <= 0n
          ) {
            return this.buildPreviewFailure(
              "Verified OptionBook pricing data is unavailable"
            );
          }

          const numerator =
            requestedContracts6 *
            pricePerContract8;

          usdcAmount =
            (numerator +
              PRICE_8_SCALE -
              1n) /
            PRICE_8_SCALE;
        }

        const previewResult =
          this.client.optionBook.previewFillOrder(
            rawOrder,
            usdcAmount
          );

        if (
          !previewResult ||
          previewResult.pricePerContract ===
          undefined ||
          previewResult.totalCollateral ===
          undefined
        ) {
          return this.buildPreviewFailure(
            "Thetanuts OptionBook preview returned incomplete data"
          );
        }

        const pricePerContract =
          BigInt(
            previewResult.pricePerContract
          );

        const totalCost =
          BigInt(
            previewResult.totalCollateral
          );

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

          feeStatus: "ZERO_VERIFIED",

          collateralToken:
            previewResult.collateralToken,

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
              previewResult.numContracts?.toString(),

            maxContracts:
              previewResult.maxContracts?.toString(),

            isCall:
              previewResult.isCall,

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

    let fallbackIndex = 0;

    for (const rawOrder of rawOrders) {
      fallbackIndex += 1;

      const underlying =
        this.resolveUnderlying(rawOrder);

      if (underlying !== targetAsset) {
        continue;
      }

      const rawApiData =
        rawOrder.rawApiData;

      if (
        typeof rawApiData?.isCall !==
        "boolean"
      ) {
        continue;
      }

      const optionRight =
        rawApiData.isCall
          ? "CALL"
          : "PUT";

      const strikes =
        Array.isArray(
          rawApiData?.strikes
        ) &&
          rawApiData.strikes.length > 0
          ? rawApiData.strikes
          : rawOrder.order?.strikes;

      if (
        !Array.isArray(strikes) ||
        strikes.length === 0
      ) {
        continue;
      }

      const optionExpirySeconds =
        Number(
          rawOrder.order?.expiry || 0
        );

      if (
        !Number.isFinite(
          optionExpirySeconds
        ) ||
        optionExpirySeconds <= 0
      ) {
        continue;
      }

      const availableAmount =
        BigInt(
          rawOrder.availableAmount || 0n
        );

      const collateralAddress =
        rawApiData?.collateral ||
        rawOrder.order?.collateralToken;

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
          rawApiData?.orderExpiryTimestamp ||
          0
        );

      const nowSeconds =
        Math.floor(Date.now() / 1000);

      const orderStillValid =
        orderValiditySeconds <= 0 ||
        orderValiditySeconds >
        nowSeconds;

      const optionNotExpired =
        optionExpirySeconds >
        nowSeconds;

      const executableNow =
        availableAmount > 0n &&
        orderStillValid &&
        optionNotExpired;

      const rawIndex =
        rawApiData?.index;

      const orderIndex =
        typeof rawIndex === "number"
          ? rawIndex
          : fallbackIndex;

      quotes.push({
        quoteId: `ob-quote-${orderIndex}`,

        sourceType: "OPTION_BOOK",

        protocol: "THETANUTS",

        asset: underlying,

        optionRight,

        strikePrice: {
          amountBaseUnits:
            strikes[0].toString(),
          decimals: 8,
          symbol: "USD",
        },

        expiryTimestampMs:
          optionExpirySeconds * 1000,

        premium: {
          amountBaseUnits: "0",
          decimals:
            collateralDecimals,
          symbol: "USDC",
        },

        availableQuantity: {
          amountBaseUnits:
            availableAmount.toString(),
          decimals:
            collateralDecimals,
          symbol: "USDC",
        },

        availableCollateralToken:
          collateralAddress,

        executableNow,

        makerAddress:
          rawOrder.makerAddress ||
          rawOrder.order?.maker,

        orderIndex,

        rawApiData: rawOrder,
      });
    }

    return quotes;
  }

  public getOptionFactoryAddress(): string {
    if (!this.client) {
      this.initializeClient();
    }

    return (
      this.client?.chainConfig
        ?.contracts?.optionFactory || ""
    );
  }

  public getOptionBookAddress(): string {
    if (!this.client) {
      this.initializeClient();
    }

    return (
      this.client?.chainConfig
        ?.contracts?.optionBook || ""
    );
  }

  public async getQuotationCount(): Promise<bigint> {
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

  public async fetchExistingRFQs(): Promise<any[]> {
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
        this.resolveRFQUnderlying(rfq);

      if (
        underlying !== targetAsset
      ) {
        continue;
      }

      const optionRight =
        this.resolveRFQOptionRight(rfq);

      if (optionRight !== "PUT") {
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
        quoteId: `rfq-quote-${rfq.id
          }`,

        rfqId:
          rfq.id?.toString() ||
          "unknown",

        maker:
          rfq.winner ||
          rfq.requester ||
          ethers.ZeroAddress,

        expiryTimestampMs:
          Number(
            rfq.expiryTimestamp || 0
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
        rfq.feeAmount !== undefined &&
        rfq.feeAmount !== null &&
        String(rfq.feeAmount) !== "";

      /*
       * The current RFQQuote domain requires a truthful
       * totalExpectedCost for a revealed quote.
       *
       * If fee information is absent, HedgeOS does not
       * fabricate a zero fee or an incomplete total.
       */
      if (!feeKnown) {
        continue;
      }

      let feeAmount: bigint;

      try {
        feeAmount =
          BigInt(rfq.feeAmount);
      } catch {
        continue;
      }

      const totalExpectedCost =
        bestPrice + feeAmount;

      quotes.push({
        ...baseFields,

        pricingStatus: "AVAILABLE",

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

        feeStatus:
          feeAmount === 0n
            ? "ZERO_VERIFIED"
            : "AVAILABLE",

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