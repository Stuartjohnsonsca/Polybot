// Auto-discover hedge opportunities across Polymarket events.
//
// All math here is execution-price (top-of-book ask) — NOT mid-price.
// A 2¢ mid-price edge can disappear entirely once you cross a 5¢ spread,
// so we filter and rank purely on what you can actually fill at.
//
// Buying YES costs the YES token's best ask. Buying NO costs the NO
// token's best ask, which we approximate as `1 − bid_YES` (the price you
// could effectively buy NO at by selling YES via the linked CLOB —
// Polymarket's conditional-tokens framework keeps these aligned within
// fractions of a cent for liquid markets).
//
// Real arbitrage tests (no spread crossings, no fees beyond gas):
//   • BUY all NO  ⇔  Σ ask_NO < n − 1  ⇔  Σ bid_YES > 1
//   • BUY all YES ⇔  Σ ask_YES < 1
//
// Mutex events satisfying either yield risk-free profit at top-of-book.
// We rank by return on capital and feed the top-N to the LP solver,
// which then walks the full ladder for the achievable size.

import { listEvents } from "./polymarket/gamma";
import type { PolyEvent, Section, PolyMarket } from "./polymarket/types";
import { optimiseBasket } from "./optimiser";
import type { Basket, OptimiseResult } from "./optimiser/types";

export type HedgeDirection = "BUY_ALL_NO" | "BUY_ALL_YES";

export interface HedgeOpportunity {
  event: PolyEvent;
  section: Section;
  legCount: number;
  // Execution-price aggregates (what you actually pay):
  yesAskSum: number; // Σ ask_YES across legs
  yesBidSum: number; // Σ bid_YES across legs
  midYesSum: number; // Σ mid_YES — kept for reference / display only
  edge: number; // top-of-book arbitrage edge in $/payout coverage
  direction: HedgeDirection;
  // Return on capital at top-of-book asks ($1 stake → topOfBookReturnPct profit).
  topOfBookReturnPct: number;
  estProfitOnHundred: number;
  // Time-scaled returns. Annualised assumes simple linear scaling
  // (return × 365/days), which is the right call for short horizons
  // and avoids overstating compound return on already-tiny edges.
  daysToResolution: number | null;
  annualisedTopReturnPct: number | null;
  // Residual risk fraction (0..1) of stake at risk if the
  // unhedged-by-mutex scenario occurs. BUY_ALL_NO ≈ 0; BUY_ALL_YES = 1.
  // Multiply by the actual stake to get a dollar amount.
  residualRiskFraction: number;
  residualRiskDescription: string;
  // LP-derived results (live ladder, large budget). Only populated for
  // the top-N candidates we actually solve.
  lp?: OptimiseResult;
  lpReturnPct?: number;
  lpAnnualisedReturnPct?: number;
  // Liquidity assessment from the LP solve at the probe budget.
  // - lpMaxExecutable: dollars the LP would actually deploy at the
  //   probe budget. Equals totalStaked. If smaller than the budget by
  //   a meaningful margin, the basket is liquidity-bound — that's the
  //   most you can deploy at the displayed return rate.
  // - liquidityCapped: true when the LP couldn't use the whole budget.
  // - totalBookDepth: $ depth of the relevant ask side across all
  //   legs, derived directly from the orderbook ladders. Independent
  //   of LP allocation; gives an absolute upper bound on size before
  //   you'd exhaust visible liquidity.
  lpMaxExecutable?: number;
  liquidityCapped?: boolean;
}

const MIN_EDGE_PCT = 0.001; // 0.1% return — anything tighter is noise/fees
const MAX_LEGS_FOR_OPPORTUNITY = 14;
const TOP_N_TO_SOLVE = 10;
// Probe budget large enough that liquidity caps actually bind on most
// markets — that's the only way the LP-derived totalStaked tells us the
// real deployable size. The LP won't use a dollar that hurts worst-case
// profit, so over-providing budget is harmless.
const LP_PROBE_BUDGET = 10_000;
// Liquidity cap is "binding" if the LP couldn't deploy at least 90% of
// the probe budget — pick a margin large enough to not flag rounding.
const LIQUIDITY_CAPPED_THRESHOLD = 0.9;

interface PricedMarket extends PolyMarket {
  yesBestBid: number;
  yesBestAsk: number;
}

function isPriced(m: PolyMarket): m is PricedMarket {
  return (
    typeof m.yesBestBid === "number" &&
    typeof m.yesBestAsk === "number" &&
    m.yesBestBid > 0 &&
    m.yesBestAsk > 0 &&
    m.yesBestAsk < 1 &&
    m.yesBestBid < m.yesBestAsk &&
    !!m.yesTokenId &&
    !!m.noTokenId
  );
}

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
      if (!event.negRisk) continue; // only mutex events have a clean self-hedge

      const priced = event.markets.filter(isPriced);
      if (priced.length < 2) continue;
      if (priced.length > MAX_LEGS_FOR_OPPORTUNITY) continue;

      const n = priced.length;
      const yesAskSum = priced.reduce((s, m) => s + m.yesBestAsk, 0);
      const yesBidSum = priced.reduce((s, m) => s + m.yesBestBid, 0);
      const midYesSum = priced.reduce(
        (s, m) => s + (m.yesPrice ?? (m.yesBestBid + m.yesBestAsk) / 2),
        0,
      );

      // Test BUY_ALL_NO arb: cost = Σ ask_NO ≈ Σ (1 − bid_YES) = n − Σ bid.
      // Profit per share = (n−1) − cost; per $1 stake = profit/cost.
      const buyAllNoCost = n - yesBidSum;
      const buyAllNoProfit = n - 1 - buyAllNoCost; // = yesBidSum − 1
      const buyAllNoReturn =
        buyAllNoCost > 0 ? buyAllNoProfit / buyAllNoCost : -Infinity;

      // Test BUY_ALL_YES arb: cost = Σ ask_YES, payout = $1.
      const buyAllYesCost = yesAskSum;
      const buyAllYesProfit = 1 - buyAllYesCost;
      const buyAllYesReturn =
        buyAllYesCost > 0 ? buyAllYesProfit / buyAllYesCost : -Infinity;

      // Pick the better of the two real-execution arb options.
      const noBeatsYes = buyAllNoReturn > buyAllYesReturn;
      const direction: HedgeDirection = noBeatsYes ? "BUY_ALL_NO" : "BUY_ALL_YES";
      const topOfBookReturnPct = noBeatsYes ? buyAllNoReturn : buyAllYesReturn;
      const edge = noBeatsYes ? buyAllNoProfit : buyAllYesProfit;

      // Only keep the candidate if the top-of-book arb actually clears.
      if (topOfBookReturnPct < MIN_EDGE_PCT) continue;
      if (edge <= 0) continue;

      const daysToResolution = computeDaysToResolution(event.endDate);
      const annualisedTopReturnPct =
        daysToResolution !== null && daysToResolution > 0
          ? topOfBookReturnPct * (365 / daysToResolution)
          : null;
      const { residualRiskFraction, residualRiskDescription } =
        computeResidualRisk(direction);

      candidates.push({
        event,
        section,
        legCount: n,
        yesAskSum,
        yesBidSum,
        midYesSum,
        edge,
        direction,
        topOfBookReturnPct,
        estProfitOnHundred: 100 * topOfBookReturnPct,
        daysToResolution,
        annualisedTopReturnPct,
        residualRiskFraction,
        residualRiskDescription,
      });
    }
  }

  candidates.sort((a, b) => b.topOfBookReturnPct - a.topOfBookReturnPct);

  // Stage 2 — LP solve top-N against live full orderbook ladder.
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
        const lpAnnualisedReturnPct =
          lpReturnPct !== undefined &&
          c.daysToResolution !== null &&
          c.daysToResolution > 0
            ? lpReturnPct * (365 / c.daysToResolution)
            : undefined;
        const lpMaxExecutable = lp.feasible ? lp.totalStaked : undefined;
        const liquidityCapped =
          lpMaxExecutable !== undefined &&
          lpMaxExecutable < basket.budget * LIQUIDITY_CAPPED_THRESHOLD;
        return {
          ...c,
          lp,
          lpReturnPct,
          lpAnnualisedReturnPct,
          lpMaxExecutable,
          liquidityCapped,
        };
      } catch (err) {
        console.error(
          `[polybot] failed to LP-solve opportunity ${c.event.slug}:`,
          err,
        );
        return c;
      }
    }),
  );

  // Re-rank by the LP-derived return where we have it; fall back to
  // top-of-book for unsolved candidates (demoted slightly).
  solved.sort((a, b) => {
    const ra = a.lpReturnPct ?? a.topOfBookReturnPct - 0.5;
    const rb = b.lpReturnPct ?? b.topOfBookReturnPct - 0.5;
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
    // Probe at $10k so liquidity caps actually surface — the LP won't
    // deploy any dollar that hurts worst-case profit, so over-providing
    // budget is harmless and the resulting totalStaked is the real
    // assessment of how much depth the basket can absorb at that rate.
    budget: LP_PROBE_BUDGET,
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

function computeDaysToResolution(endDate?: string): number | null {
  if (!endDate) return null;
  const ms = new Date(endDate).getTime();
  if (Number.isNaN(ms)) return null;
  const days = (ms - Date.now()) / 86_400_000;
  if (days < 0) return null; // past — shouldn't occur on active events
  return days;
}

function computeResidualRisk(direction: HedgeDirection): {
  residualRiskFraction: number;
  residualRiskDescription: string;
} {
  if (direction === "BUY_ALL_NO") {
    // Buying NO on every leg of a mutex event:
    //   • Exactly 1 YES (normal mutex):  n−1 NOs win → profit, by design.
    //   • 0 YES (no listed winner / event voided):  all n NOs win → bigger
    //     profit than the 1-YES case. Upside, not risk.
    //   • 2+ YES (would require Polymarket's mutex to fail):  multiple NOs
    //     lose. Polymarket's negRisk mechanism enforces mutex resolution
    //     on-chain, so this is effectively unreachable.
    return {
      residualRiskFraction: 0,
      residualRiskDescription:
        "Effectively zero. The hedge wins (or wins more) in every legitimate resolution. Multiple-YES would require Polymarket's on-chain mutex mechanism to fail.",
    };
  }
  // BUY_ALL_YES — buying YES on every leg.
  //   • Exactly 1 YES:  the one YES wins → profit, by design.
  //   • 0 YES (event voided OR the actual winner isn't a listed candidate):
  //     every YES bet expires worthless → entire stake lost.
  //   • 2+ YES (mutex failure):  multiple YESs win → bigger profit.
  return {
    residualRiskFraction: 1,
    residualRiskDescription:
      "Full stake at risk if NONE of the listed markets resolves YES — i.e. the actual winner isn't on this list, or the event is voided.",
  };
}
