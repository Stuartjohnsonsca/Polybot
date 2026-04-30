// Public optimiser entry. Server-side only — pulls orderbooks via the
// CLOB client and runs the LP solver lazily.

import { fetchOrderbooks } from "../polymarket/clob";
import type { Basket, BookMap, OptimiseResult } from "./types";
import { enumerateScenarios } from "./thesis";
import { buildLadders } from "./ladder";
import { buildProgram, solveProgram } from "./lp";
import { buildResult } from "./result";

export type { Basket, BasketLeg, OptimiseResult, Side, Thesis, ThesisPredicate } from "./types";

export async function optimiseBasket(basket: Basket): Promise<OptimiseResult> {
  if (basket.legs.length === 0) {
    return emptyResult(basket, "Add at least one leg to the basket.");
  }
  if (basket.budget <= 0) {
    return emptyResult(basket, "Set a positive budget.");
  }

  const scenarios = enumerateScenarios(basket.legs.length, basket.thesis);
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
