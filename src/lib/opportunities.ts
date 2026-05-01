// Auto-discover hedge opportunities across Polymarket events.
//
// Two-stage detection:
//   1. Fast scan — find mutex events whose mid-price Yes sums diverge
//      from $1, ranked by estimated return on capital. This is cheap
//      (no orderbook fetches) and prunes the catalogue down to 10ish
//      genuine candidates.
//   2. Per-candidate LP — for the top 10, build the canonical basket
//      ("exactly 1 YES" thesis on every leg, $100 budget) and run the
//      LP solver against the live CLOB orderbook ladders. The LP-derived
//      stats include real-liquidity worst-case profit, the per-leg side
//      the optimiser actually wants to take, and any warnings (clipped
//      liquidity, dominated legs, etc.).
//
// The page-level revalidate=60s caches the whole computation so we
// don't re-solve 10 LPs on every request.

import { listEvents } from "./polymarket/gamma";
import type { PolyEvent, Section } from "./polymarket/types";
import { optimiseBasket } from "./optimiser";
import type { Basket, OptimiseResult } from "./optimiser/types";

export type HedgeDirection = "BUY_ALL_NO" | "BUY_ALL_YES";

export interface HedgeOpportunity {
  event: PolyEvent;
  section: Section;
  legCount: number;
  yesPriceSum: number;
  edge: number; // |Σ Yes − 1|
  direction: HedgeDirection;
  // Mid-price estimates (cheap, what we use to rank).
  estReturnPct: number;
  estProfitOnHundred: number;
  // LP-derived results against live orderbook ladders ($100 budget).
  // Populated only for the top-N candidates we actually solve.
  lp?: OptimiseResult;
  lpReturnPct?: number; // lp.worstCaseProfit / lp.totalStaked, if both > 0
}

const MIN_EDGE = 0.005;
const MAX_LEGS_FOR_OPPORTUNITY = 14;
const TOP_N_TO_SOLVE = 10;
const DEFAULT_LP_BUDGET = 100;

export async function findHedgeOpportunities(): Promise<HedgeOpportunity[]> {
  const [politics, forex] = await Promise.all([
    listEvents({ tagSlug: "politics", limit: 100 }),
    listEvents({ tagSlug: "forex", limit: 100 }),
  ]);

  const buckets: Array<{ events: PolyEvent[]; section: Section }> = [
    { events: politics, section: "politics" },
    { events: forex, section: "forex" },
  ];

  const candidates: HedgeOpportunity[] = [];

  for (const { events, section } of buckets) {
    for (const event of events) {
      if (!event.negRisk) continue;
      const priced = event.markets.filter(
        (m): m is typeof m & { yesPrice: number } =>
          typeof m.yesPrice === "number" &&
          m.yesPrice > 0 &&
          m.yesPrice < 1 &&
          !!m.yesTokenId &&
          !!m.noTokenId,
      );
      if (priced.length < 2) continue;
      if (priced.length > MAX_LEGS_FOR_OPPORTUNITY) continue;

      const yesPriceSum = priced.reduce((s, m) => s + m.yesPrice, 0);
      const edge = Math.abs(yesPriceSum - 1);
      if (edge < MIN_EDGE) continue;

      const direction: HedgeDirection = yesPriceSum > 1 ? "BUY_ALL_NO" : "BUY_ALL_YES";
      const n = priced.length;
      const estReturnPct =
        direction === "BUY_ALL_NO"
          ? (yesPriceSum - 1) / (n - yesPriceSum)
          : (1 - yesPriceSum) / yesPriceSum;

      candidates.push({
        event,
        section,
        legCount: n,
        yesPriceSum,
        edge,
        direction,
        estReturnPct,
        estProfitOnHundred: 100 * estReturnPct,
      });
    }
  }

  candidates.sort((a, b) => b.estReturnPct - a.estReturnPct);

  // Stage 2 — LP-solve the top N in parallel against live orderbook depth.
  // Each solve fetches per-token order books, builds the LP, and returns
  // the achievable worst-case profit + the per-leg trades the optimiser
  // actually picks. We swallow individual solve failures so a single
  // upstream hiccup doesn't drop the whole list.
  const topToSolve = candidates.slice(0, TOP_N_TO_SOLVE);
  const solved = await Promise.all(
    topToSolve.map(async (c) => {
      try {
        const basket = syntheticBasketForOpportunity(c);
        const lp = await optimiseBasket(basket);
        const lpReturnPct =
          lp.feasible && lp.totalStaked > 0
            ? lp.worstCaseProfit / lp.totalStaked
            : undefined;
        return { ...c, lp, lpReturnPct };
      } catch (err) {
        console.error(
          `[polybot] failed to LP-solve opportunity ${c.event.slug}:`,
          err,
        );
        return c;
      }
    }),
  );

  // Re-rank by the LP-derived return where we have it; fall back to the
  // mid-price estimate for ties or unsolved candidates.
  solved.sort((a, b) => {
    const ra = a.lpReturnPct ?? a.estReturnPct - 0.5; // unsolved demoted
    const rb = b.lpReturnPct ?? b.estReturnPct - 0.5;
    return rb - ra;
  });

  return [...solved, ...candidates.slice(TOP_N_TO_SOLVE)];
}

function syntheticBasketForOpportunity(o: HedgeOpportunity): Basket {
  return {
    id: `auto-${o.event.id}`,
    name: o.event.title,
    section: o.section,
    legs: legsForOpportunity(o).map((l) => ({
      ...l,
      preferredSide: "EITHER",
    })),
    thesis: { predicates: [{ kind: "exactlyK", k: 1 }] },
    budget: DEFAULT_LP_BUDGET,
  };
}

export interface OpportunityLeg {
  marketId: string;
  question: string;
  yesPrice: number | null;
  yesTokenId: string | null;
  noTokenId: string | null;
}

export function legsForOpportunity(o: HedgeOpportunity): OpportunityLeg[] {
  return o.event.markets
    .filter((m) => !!m.yesTokenId && !!m.noTokenId)
    .map((m) => ({
      marketId: m.id,
      question: m.question,
      yesPrice: m.yesPrice,
      yesTokenId: m.yesTokenId,
      noTokenId: m.noTokenId,
    }));
}
