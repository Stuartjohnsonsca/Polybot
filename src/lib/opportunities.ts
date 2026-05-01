// Auto-discover hedge opportunities across Polymarket events. The simple
// (cheap) detection used here: mutually-exclusive events whose Yes prices
// don't sum to $1.00 imply a risk-free arbitrage — buy NO on every leg
// when Σ Yes > 1 (n−1 NOs always win, payout n−1 per share), or buy YES
// on every leg when Σ Yes < 1 (exactly one wins, payout $1 per share).
//
// We skip the LP here and use mid prices; the LP runs once the user
// constructs the basket and we have full orderbook ladders to compute
// achievable fills under real liquidity.

import { listEvents } from "./polymarket/gamma";
import type { PolyEvent, Section } from "./polymarket/types";

export type HedgeDirection = "BUY_ALL_NO" | "BUY_ALL_YES";

export interface HedgeOpportunity {
  event: PolyEvent;
  section: Section;
  legCount: number;
  yesPriceSum: number; // sum of Yes prices across priced markets
  edge: number; // |Σ Yes − 1|
  direction: HedgeDirection;
  // Estimated profit on $100 budget assuming you fill at mid prices.
  // Real fills come from the orderbook ladder; this is a top-of-funnel
  // ranking score, not a promise.
  estReturnPct: number;
  estProfitOnHundred: number;
}

const MIN_EDGE = 0.005; // 0.5¢ — below this is noise
const MAX_LEGS_FOR_OPPORTUNITY = 14; // matches the optimiser's full-enum cap

export async function findHedgeOpportunities(): Promise<HedgeOpportunity[]> {
  const [politics, forex] = await Promise.all([
    listEvents({ tagSlug: "politics", limit: 100 }),
    listEvents({ tagSlug: "forex", limit: 100 }),
  ]);

  const buckets: Array<{ events: PolyEvent[]; section: Section }> = [
    { events: politics, section: "politics" },
    { events: forex, section: "forex" },
  ];

  const out: HedgeOpportunity[] = [];

  for (const { events, section } of buckets) {
    for (const event of events) {
      if (!event.negRisk) continue; // only mutex events have a clean self-hedge

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

      // Profit on $B budget when filling at mid prices.
      // BUY_ALL_NO: cost ≈ m·(n − Σp), payout = m·(n−1), so profit/cost
      //            = (Σp − 1) / (n − Σp).
      // BUY_ALL_YES: cost ≈ m·Σp, payout = m·1, so profit/cost = (1 − Σp)/Σp.
      const n = priced.length;
      const estReturnPct =
        direction === "BUY_ALL_NO"
          ? (yesPriceSum - 1) / (n - yesPriceSum)
          : (1 - yesPriceSum) / yesPriceSum;

      out.push({
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

  return out.sort((a, b) => b.estReturnPct - a.estReturnPct);
}

// Trimmed leg shape suitable for client-side basket construction without
// shipping the full PolyMarket type to the browser.
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
