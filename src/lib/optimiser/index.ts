// Public optimiser entry. Server-side only — pulls orderbooks via the
// CLOB client and runs the LP solver lazily.
//
// Invariant: this function NEVER throws. Every internal failure is
// converted into a `feasible: false` OptimiseResult with a user-facing
// warning, so the calling server action can serialise the result back
// to the client cleanly. Server actions that throw in production are
// redacted by Next.js, so propagating errors loses the actionable
// message — we keep it inside the result instead.

import { fetchOrderbooks } from "../polymarket/clob";
import type { Basket, BookMap, OptimiseResult } from "./types";
import { enumerateScenarios, ThesisEnumerationError } from "./thesis";
import { buildLadders } from "./ladder";
import { buildProgram, solveProgram } from "./lp";
import { buildResult } from "./result";

export type { Basket, BasketLeg, OptimiseResult, Side, Thesis, ThesisPredicate } from "./types";

export async function optimiseBasket(basket: Basket): Promise<OptimiseResult> {
  try {
    return await optimiseBasketUnsafe(basket);
  } catch (err) {
    console.error("[polybot] optimiseBasket unexpected error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Optimisation failed for an unknown reason.";
    return emptyResult(basket, message);
  }
}

async function optimiseBasketUnsafe(basket: Basket): Promise<OptimiseResult> {
  if (basket.legs.length === 0) {
    return emptyResult(basket, "Add at least one leg to the basket.");
  }
  if (basket.budget <= 0) {
    return emptyResult(basket, "Set a positive budget.");
  }

  let scenarios;
  try {
    scenarios = enumerateScenarios(basket.legs.length, basket.thesis);
  } catch (err) {
    if (err instanceof ThesisEnumerationError) {
      return emptyResult(basket, err.message);
    }
    throw err;
  }
  if (scenarios.length === 0) {
    return emptyResult(
      basket,
      "Thesis admits no scenarios — the predicates contradict each other.",
    );
  }

  // Fetch orderbooks for each (leg, side) tokenId we need.
  const tokenIds = new Set<string>();
  for (const leg of basket.legs) {
    if (leg.preferredSide !== "NO" && leg.yesTokenId) tokenIds.add(leg.yesTokenId);
    if (leg.preferredSide !== "YES" && leg.noTokenId) tokenIds.add(leg.noTokenId);
  }
  const books: BookMap = await fetchOrderbooks(Array.from(tokenIds));

  const ladders = buildLadders(basket.legs, books);
  const totalLevels = ladders.reduce((s, l) => s + l.levels.length, 0);
  if (totalLevels === 0) {
    return emptyResult(
      basket,
      "No orderbook depth available on any selected leg. Try again in a moment or pick more liquid markets.",
    );
  }

  const model = buildProgram(basket, scenarios, ladders);
  const solution = await solveProgram(model);
  return buildResult(basket, scenarios, ladders, solution);
}

function emptyResult(basket: Basket, message: string): OptimiseResult {
  return {
    feasible: false,
    totalStaked: 0,
    worstCaseProfit: 0,
    expectedProfit: null,
    legStakes: [],
    scenarios: [],
    coverage: {
      scenariosCovered: 0,
      scenariosTotal: 1 << basket.legs.length,
      probabilityMassCovered: null,
    },
    warnings: [{ level: "warn", message }],
    budget: basket.budget,
    thesis: basket.thesis,
  };
}
