// Public types for the basket optimiser. The shape here is independent of
// the LP solver and the CLOB client so we can swap either later without
// touching the UI.

import type { BookLevel, NormalisedBook } from "../polymarket/clob";
import type { Section } from "../polymarket/types";

export type Side = "YES" | "NO" | "EITHER";

// A basket leg references a market by its Polymarket id. The per-leg
// `preferredSide` pins which side(s) the LP is allowed to stake on.
// `cap` is an optional user-set dollar cap on this leg (separate from the
// orderbook depth cap, which is always enforced).
export interface BasketLeg {
  marketId: string;
  question: string;
  yesPrice: number | null;
  yesTokenId: string | null;
  noTokenId: string | null;
  preferredSide: Side;
  cap?: number;
}

export type ThesisPredicate =
  | { kind: "atMostK"; k: number }
  | { kind: "exactlyK"; k: number }
  | { kind: "implies"; from: number; to: number }; // indices into basket.legs

export interface Thesis {
  predicates: ThesisPredicate[];
  // Optional subjective probabilities over allowed scenarios, keyed by the
  // scenario's bitmask string. Sum should be ≤ 1; the residual is the
  // user's confessed tail-risk mass.
  scenarioProbabilities?: Record<string, number>;
}

export interface Basket {
  id: string;
  name: string;
  section: Section;
  legs: BasketLeg[];
  thesis: Thesis;
  budget: number;
}

// A scenario is a yes-bitmap over the basket's legs. Encoded as a
// fixed-length bool array; the bitmask string ("01101…") is used as a
// stable map key.
export interface Scenario {
  yes: boolean[];
  key: string; // "01101…"
}

// Per-leg stake breakdown returned by the solver.
export interface LegStakeLevel {
  price: number;
  shares: number;
  dollars: number;
}

export interface LegStake {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  totalDollars: number;
  totalShares: number;
  averagePrice: number; // weighted by shares
  levels: LegStakeLevel[]; // only levels that received stake
  unfilledLiquidity: number; // dollar depth left at the next level after the last fill
}

export interface ScenarioPayout {
  key: string;
  yes: boolean[];
  payout: number; // total dollars returned (winning shares × $1)
  profit: number; // payout − totalStaked
  probability: number | null; // user-supplied or null
}

export interface OptimiseWarning {
  level: "info" | "warn";
  message: string;
}

export interface OptimiseResult {
  feasible: boolean;
  totalStaked: number;
  worstCaseProfit: number;
  expectedProfit: number | null; // present iff probabilities supplied
  legStakes: LegStake[];
  scenarios: ScenarioPayout[];
  coverage: {
    scenariosCovered: number;
    scenariosTotal: number;
    probabilityMassCovered: number | null;
  };
  warnings: OptimiseWarning[];
  // Echoes for the UI:
  budget: number;
  thesis: Thesis;
}

export interface BookMap {
  // Keyed by clob token id.
  [tokenId: string]: NormalisedBook;
}

// Re-export for convenience.
export type { BookLevel, NormalisedBook };
