import type { PolyEvent, PolyMarket } from "./polymarket/types";

export interface HedgeSummary {
  // Sum of "Yes" prices across all markets in the event.
  // For a true mutually-exclusive event (negRisk) this should be ≤ 1.
  // > 1 implies a Dutch-book opportunity (buying every "No" guarantees profit).
  yesPriceSum: number;
  // Markets with a usable yes price.
  considered: number;
  // True if the event is flagged by Polymarket as mutually exclusive.
  mutuallyExclusive: boolean;
  // Surplus if Yes prices sum > 1 (potential edge before fees/slippage).
  dutchBookEdge: number | null;
  // Cheapest "No" basket cost per $1 payout, if mutually exclusive.
  // = sum(1 - yes_i). For a fair MX event this equals (n - 1).
  noBasketCost: number | null;
}

export function summariseEvent(event: PolyEvent): HedgeSummary {
  const priced = event.markets.filter(
    (m): m is PolyMarket & { yesPrice: number } => typeof m.yesPrice === "number",
  );
  const yesPriceSum = priced.reduce((s, m) => s + m.yesPrice, 0);
  const noBasketCost = event.negRisk
    ? priced.reduce((s, m) => s + (1 - m.yesPrice), 0)
    : null;
  const dutchBookEdge =
    event.negRisk && priced.length > 1 ? Math.max(0, yesPriceSum - 1) : null;

  return {
    yesPriceSum,
    considered: priced.length,
    mutuallyExclusive: event.negRisk,
    dutchBookEdge: dutchBookEdge && dutchBookEdge > 0 ? dutchBookEdge : null,
    noBasketCost,
  };
}

// Hedge edge for mutually-exclusive events: |Σ Yes − 1|, descending.
//
// The math: in a mutex event with n markets, exactly 1 resolves YES and
// (n−1) resolve NO. So:
//   • Buying NO on every leg always pays $(n−1) regardless of which one
//     wins → cost (n − Σp), profit Σp − 1 if Σp > 1.
//   • Buying YES on every leg always pays $1 (the winner) → cost Σp,
//     profit 1 − Σp if Σp < 1.
// Both strategies are self-hedging because the mutex constraint means
// exactly the right number of legs settle in your favour. The metric
// |Σp − 1| picks the larger of the two edges, surfacing arbitrage
// candidates in either direction. Returns 0 for non-mutex events since
// no canonical self-hedge exists without a user-supplied thesis.
export function hedgeEdge(event: PolyEvent): number {
  if (!event.negRisk) return 0;
  const summary = summariseEvent(event);
  if (summary.considered < 2) return 0;
  return Math.abs(summary.yesPriceSum - 1);
}

export interface BasketLeg {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  price: number;
  stake: number; // dollars committed
  payoutIfWin: number; // dollars returned (including stake)
}

// Compute the worst-case payout of a basket of legs assuming each leg's
// market resolves in some scenario. For each leg, payout = stake/price if
// YES resolves and the leg is YES (or NO resolves and the leg is NO).
// We don't model joint resolution here — this is a thin primitive used by
// the event detail page to render a "what would $X across these legs do?"
// preview. Full LP-based optimisation comes later.
export function evaluateBasket(legs: BasketLeg[], totalStake: number): {
  totalStake: number;
  legs: BasketLeg[];
} {
  const sized = legs.map((l) => ({ ...l }));
  return { totalStake, legs: sized };
}
