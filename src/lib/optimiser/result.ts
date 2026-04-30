// Map the raw LP solution + program inputs into a UI-friendly OptimiseResult.

import type {
  Basket,
  LegStake,
  LegStakeLevel,
  OptimiseResult,
  OptimiseWarning,
  Scenario,
  ScenarioPayout,
} from "./types";
import type { LadderSlice } from "./ladder";
import { LP_T_POS, LP_T_NEG, levelVarName } from "./lp";
import type { LpRawSolution } from "./lp";

const EPSILON = 1e-6;

export function buildResult(
  basket: Basket,
  scenarios: Scenario[],
  ladders: LadderSlice[],
  solution: LpRawSolution,
): OptimiseResult {
  const warnings: OptimiseWarning[] = [];

  if (!solution.feasible) {
    return {
      feasible: false,
      totalStaked: 0,
      worstCaseProfit: 0,
      expectedProfit: null,
      legStakes: [],
      scenarios: [],
      coverage: {
        scenariosCovered: scenarios.length,
        scenariosTotal: 1 << basket.legs.length,
        probabilityMassCovered: null,
      },
      warnings: [
        {
          level: "warn",
          message:
            "LP infeasible — the thesis combined with the budget admits no positive-stake basket. Try a wider thesis or a different leg selection.",
        },
      ],
      budget: basket.budget,
      thesis: basket.thesis,
    };
  }

  // Aggregate stake per (legIndex, side) by walking ladders + var values.
  type Agg = {
    legIndex: number;
    side: "YES" | "NO";
    levels: LegStakeLevel[];
    totalDollars: number;
    totalShares: number;
    nextUnfilled: number; // depth available beyond what we filled
  };
  const aggs = new Map<string, Agg>();

  for (const slice of ladders) {
    const key = `${slice.legIndex}:${slice.side}`;
    let totalDollars = 0;
    let totalShares = 0;
    const filled: LegStakeLevel[] = [];
    let unfilled = 0;
    let foundUnfilledMarker = false;

    slice.levels.forEach((lvl, levelIdx) => {
      const v = solution.varValues[levelVarName(slice.legIndex, slice.side, levelIdx)] ?? 0;
      if (v > EPSILON) {
        const shares = v / lvl.price;
        totalDollars += v;
        totalShares += shares;
        filled.push({ price: lvl.price, dollars: v, shares });
        // If we filled at this level, the remaining capacity at the same
        // level (cap − v) plus untouched higher levels are the buffer.
        const remainingHere = Math.max(0, lvl.dollarCap - v);
        unfilled += remainingHere;
      } else if (filled.length > 0 && !foundUnfilledMarker) {
        // First level we didn't touch after some fill — its full depth
        // is the immediate next bucket of available liquidity.
        unfilled += lvl.dollarCap;
        foundUnfilledMarker = true;
      }
    });

    aggs.set(key, {
      legIndex: slice.legIndex,
      side: slice.side,
      levels: filled,
      totalDollars,
      totalShares,
      nextUnfilled: unfilled,
    });
  }

  const legStakes: LegStake[] = [];
  for (const agg of aggs.values()) {
    if (agg.totalDollars <= EPSILON) continue; // skip zero-stake legs
    const leg = basket.legs[agg.legIndex];
    legStakes.push({
      marketId: leg.marketId,
      question: leg.question,
      side: agg.side,
      totalDollars: agg.totalDollars,
      totalShares: agg.totalShares,
      averagePrice: agg.totalShares > 0 ? agg.totalDollars / agg.totalShares : 0,
      levels: agg.levels.sort((a, b) => a.price - b.price),
      unfilledLiquidity: agg.nextUnfilled,
    });
  }

  const totalStaked = legStakes.reduce((s, l) => s + l.totalDollars, 0);

  // Compute payout per scenario from the actual stakes.
  const scenarioPayouts: ScenarioPayout[] = scenarios.map((s) => {
    let payout = 0;
    for (const stake of legStakes) {
      const legIndex = basket.legs.findIndex((l) => l.marketId === stake.marketId);
      const isYes = s.yes[legIndex];
      const matches = (stake.side === "YES" && isYes) || (stake.side === "NO" && !isYes);
      if (matches) payout += stake.totalShares;
    }
    const probability = basket.thesis.scenarioProbabilities?.[s.key] ?? null;
    return {
      key: s.key,
      yes: s.yes,
      payout,
      profit: payout - totalStaked,
      probability,
    };
  });

  // Sort worst → best.
  scenarioPayouts.sort((a, b) => a.profit - b.profit);

  const probMassCovered = computeProbMass(basket.thesis.scenarioProbabilities, scenarios);
  const expectedProfit = computeExpectedProfit(scenarioPayouts);

  // Heuristic warnings.
  if (totalStaked < basket.budget * 0.95) {
    warnings.push({
      level: "info",
      message: `Used ${formatPct(totalStaked / basket.budget)} of the requested budget — the LP can't profitably deploy more given the current liquidity / thesis.`,
    });
  }
  for (const stake of legStakes) {
    if (stake.unfilledLiquidity < stake.totalDollars * 0.1) {
      warnings.push({
        level: "warn",
        message: `Leg "${truncate(stake.question)}" is close to liquidity-constrained — staked $${stake.totalDollars.toFixed(0)} with only $${stake.unfilledLiquidity.toFixed(0)} headroom at the next price level.`,
      });
    }
  }
  const dominated = basket.legs.filter((l, idx) => {
    const yesAgg = aggs.get(`${idx}:YES`);
    const noAgg = aggs.get(`${idx}:NO`);
    return (yesAgg?.totalDollars ?? 0) <= EPSILON && (noAgg?.totalDollars ?? 0) <= EPSILON;
  });
  if (dominated.length > 0) {
    warnings.push({
      level: "info",
      message: `${dominated.length} leg(s) received zero stake — their prices don't help under this thesis.`,
    });
  }
  if (probMassCovered !== null && probMassCovered < 0.99) {
    warnings.push({
      level: "warn",
      message: `Subjective probabilities sum to ${formatPct(probMassCovered)}; the residual ${formatPct(1 - probMassCovered)} of mass is uncovered tail risk.`,
    });
  }

  return {
    feasible: true,
    totalStaked,
    worstCaseProfit: solution.worstCaseProfit,
    expectedProfit,
    legStakes,
    scenarios: scenarioPayouts,
    coverage: {
      scenariosCovered: scenarios.length,
      scenariosTotal: 1 << basket.legs.length,
      probabilityMassCovered: probMassCovered,
    },
    warnings,
    budget: basket.budget,
    thesis: basket.thesis,
  };
}

function computeProbMass(
  probs: Record<string, number> | undefined,
  scenarios: Scenario[],
): number | null {
  if (!probs) return null;
  let total = 0;
  for (const s of scenarios) {
    total += probs[s.key] ?? 0;
  }
  return total;
}

function computeExpectedProfit(scenarios: ScenarioPayout[]): number | null {
  const supplied = scenarios.filter((s) => s.probability !== null);
  if (supplied.length === 0) return null;
  return supplied.reduce((sum, s) => sum + (s.probability ?? 0) * s.profit, 0);
}

function formatPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function truncate(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
