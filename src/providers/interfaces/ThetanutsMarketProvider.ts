import { MarketQuote, TypedRiskIntent } from "../../types";

export interface OptionBookQuoteSource {
  fetchExecutableOrders(intent: TypedRiskIntent): Promise<MarketQuote[]>;
}

export interface RFQQuoteSource {
  requestCustomQuote(intent: TypedRiskIntent): Promise<MarketQuote[]>;
}

export interface ThetanutsMarketProvider {
  optionBookSource: OptionBookQuoteSource;
  rfqSource: RFQQuoteSource;
  fetchMarketQuotes(intent: TypedRiskIntent): Promise<MarketQuote[]>;
}
