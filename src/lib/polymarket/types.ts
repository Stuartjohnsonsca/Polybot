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
  clobTokenIds?: string; // JSON-encoded ["yesTokenId", "noTokenId"]
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

// Re-exported from the central section config so all importers see the
// single source of truth.
export type { Section } from "@/lib/sections";
import type { Section } from "@/lib/sections";
import { getSectionByTagSlug } from "@/lib/sections";

export interface PolyMarket {
  id: string;
  conditionId?: string;
  question: string;
  slug: string;
  outcomes: string[]; // typically ["Yes", "No"]
  outcomePrices: number[]; // aligned with outcomes
  yesPrice: number | null; // mid / last trade price of the "Yes" outcome
  yesBestBid: number | null; // top-of-book bid for YES — sell-side execution
  yesBestAsk: number | null; // top-of-book ask for YES — buy-side execution
  yesTokenId: string | null;
  noTokenId: string | null;
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

export function deriveSection(tags: GammaTag[]): Section | null {
  // Walk every tag on the event, return the first one that matches a
  // configured section. Iteration order matches Polymarket's tag list,
  // so the most specific tag tends to win — which is what we want.
  for (const t of tags) {
    const match = getSectionByTagSlug(t.slug);
    if (match) return match.id as Section;
  }
  return null;
}
