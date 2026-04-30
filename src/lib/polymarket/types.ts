// Subset of the Polymarket Gamma API response surface we care about.
// The Gamma API returns `outcomes` and `outcomePrices` as JSON-encoded
// strings rather than arrays; the helpers in `gamma.ts` normalise these.

export interface GammaTag {
  id: string;
  label: string;
  slug: string;
}

export interface GammaMarketRaw {
  id: string;
  conditionId?: string;
  question: string;
  slug: string;
  outcomes?: string;
  outcomePrices?: string;
  startDate?: string;
  endDate?: string;
  volume?: string | number;
  volumeNum?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  lastTradePrice?: number;
  bestBid?: number;
  bestAsk?: number;
  resolutionSource?: string;
  umaResolutionStatus?: string;
}

export interface GammaEventRaw {
  id: string;
  slug: string;
  ticker?: string;
  title: string;
  description?: string;
  image?: string;
  icon?: string;
  startDate?: string;
  endDate?: string;
  creationDate?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  featured?: boolean;
  liquidity?: number;
  volume?: number;
  volume24hr?: number;
  volume1wk?: number;
  competitive?: number;
  negRisk?: boolean;
  enableOrderBook?: boolean;
  markets?: GammaMarketRaw[];
  tags?: GammaTag[];
}

export interface PolyMarket {
  id: string;
  conditionId?: string;
  question: string;
  slug: string;
  outcomes: string[]; // typically ["Yes", "No"]
  outcomePrices: number[]; // aligned with outcomes
  yesPrice: number | null; // convenience: price of the "Yes" outcome
  volume: number;
  liquidity: number;
  endDate?: string;
  active: boolean;
  closed: boolean;
}

export interface PolyEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: string;
  icon?: string;
  endDate?: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  negRisk: boolean;
  markets: PolyMarket[];
  tags: GammaTag[];
}
