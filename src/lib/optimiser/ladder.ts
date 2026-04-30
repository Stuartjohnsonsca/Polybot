import type { BasketLeg, BookMap, NormalisedBook } from "./types";

// LP-ready ladder for one (leg, side) pair. `levels` is sorted cheapest
// price first (the order in which an LP wanting to buy shares should fill).
// Per level, `dollarCap` is the max dollars we can spend at that price
// (computed from share-size × price). `dollarsPerShare` = price.
export interface LadderSlice {
  legIndex: number;
  side: "YES" | "NO";
  levels: { price: number; dollarCap: number }[];
  // Pre-computed: total dollars available across the ladder.
  totalDollarCap: number;
}

// Build a per-leg, per-side ladder from the provided orderbooks. Buying
// YES of market i means taking ASKS of i's YES token at increasing prices.
// Buying NO of market i means taking ASKS of i's NO token at increasing
// prices.
export function buildLadders(legs: BasketLeg[], books: BookMap): LadderSlice[] {
  const out: LadderSlice[] = [];
  legs.forEach((leg, legIndex) => {
    if (leg.preferredSide === "YES" || leg.preferredSide === "EITHER") {
      out.push(asksToLadder(legIndex, "YES", leg.yesTokenId, books));
    }
    if (leg.preferredSide === "NO" || leg.preferredSide === "EITHER") {
      out.push(asksToLadder(legIndex, "NO", leg.noTokenId, books));
    }
  });
  return out;
}

function asksToLadder(
  legIndex: number,
  side: "YES" | "NO",
  tokenId: string | null,
  books: BookMap,
): LadderSlice {
  if (!tokenId) {
    return { legIndex, side, levels: [], totalDollarCap: 0 };
  }
  const book: NormalisedBook | undefined = books[tokenId];
  if (!book) {
    return { legIndex, side, levels: [], totalDollarCap: 0 };
  }
  // book.asks is already sorted ascending by price (best ask first).
  const levels = book.asks
    .filter((l) => l.price > 0 && l.price < 1 && l.dollarDepth > 0)
    .map((l) => ({ price: l.price, dollarCap: l.dollarDepth }));
  const totalDollarCap = levels.reduce((s, l) => s + l.dollarCap, 0);
  return { legIndex, side, levels, totalDollarCap };
}
