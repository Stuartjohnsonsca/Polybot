import type { GammaEventRaw, GammaMarketRaw, PolyEvent, PolyMarket } from "./types";

const BASE = process.env.GAMMA_API_BASE ?? "https://gamma-api.polymarket.com";

function safeJsonArray<T = unknown>(s: string | undefined | null): T[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function normaliseMarket(m: GammaMarketRaw): PolyMarket {
  const outcomes = safeJsonArray<string>(m.outcomes);
  const priceStrings = safeJsonArray<string | number>(m.outcomePrices);
  const outcomePrices = priceStrings.map((p) => toNumber(p));
  const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const yesPrice =
    yesIdx >= 0 && yesIdx < outcomePrices.length
      ? outcomePrices[yesIdx]
      : typeof m.lastTradePrice === "number"
        ? m.lastTradePrice
        : null;

  // clobTokenIds is a JSON-stringified ["yesTokenId", "noTokenId"] aligned
  // with the outcomes array. We resolve each side defensively.
  const tokenIds = safeJsonArray<string>(m.clobTokenIds);
  const yesTokenId = yesIdx >= 0 && yesIdx < tokenIds.length ? tokenIds[yesIdx] : null;
  const noIdx = outcomes.findIndex((o) => o.toLowerCase() === "no");
  const noTokenId = noIdx >= 0 && noIdx < tokenIds.length ? tokenIds[noIdx] : null;

  // Gamma's bestBid/bestAsk are the top-of-book quotes for the YES token.
  // They diverge from yesPrice (which is the mid / last trade) by the
  // half-spread. We capture them here so opportunity detection and
  // ranking can use real execution prices instead of mid prices.
  const yesBestBid =
    typeof m.bestBid === "number" && m.bestBid > 0 && m.bestBid < 1
      ? m.bestBid
      : null;
  const yesBestAsk =
    typeof m.bestAsk === "number" && m.bestAsk > 0 && m.bestAsk < 1
      ? m.bestAsk
      : null;

  return {
    id: m.id,
    conditionId: m.conditionId,
    question: m.question,
    slug: m.slug,
    outcomes,
    outcomePrices,
    yesPrice,
    yesBestBid,
    yesBestAsk,
    yesTokenId,
    noTokenId,
    volume: toNumber(m.volumeNum ?? m.volume),
    liquidity: toNumber(m.liquidityNum ?? m.liquidity),
    endDate: m.endDate,
    active: !!m.active,
    closed: !!m.closed,
  };
}

export function normaliseEvent(e: GammaEventRaw): PolyEvent {
  const markets = (e.markets ?? []).map(normaliseMarket).filter((m) => !m.closed);
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    description: e.description,
    image: e.image,
    icon: e.icon,
    endDate: e.endDate,
    volume: toNumber(e.volume),
    volume24hr: toNumber(e.volume24hr),
    liquidity: toNumber(e.liquidity),
    negRisk: !!e.negRisk,
    markets,
    tags: e.tags ?? [],
  };
}

async function gammaFetch<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  // Page-level `export const revalidate = N` handles render caching — we
  // intentionally skip Next's fetch-level cache since some Gamma payloads
  // exceed its 2MB cache ceiling and we don't want the warning spam.
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Gamma ${res.status} ${res.statusText} for ${url.pathname}${url.search}`);
  }
  return (await res.json()) as T;
}

export interface ListEventsOptions {
  tagSlug: string;
  limit?: number;
  offset?: number;
  order?: "volume24hr" | "volume" | "liquidity" | "endDate";
  ascending?: boolean;
}

export async function listEvents(opts: ListEventsOptions): Promise<PolyEvent[]> {
  const raw = await gammaFetch<GammaEventRaw[]>("/events", {
    tag_slug: opts.tagSlug,
    active: true,
    closed: false,
    archived: false,
    limit: opts.limit ?? 40,
    offset: opts.offset ?? 0,
    order: opts.order ?? "volume24hr",
    ascending: opts.ascending ?? false,
  });
  return raw.map(normaliseEvent).filter((e) => e.markets.length > 0);
}

export async function getEventBySlug(slug: string): Promise<PolyEvent | null> {
  const raw = await gammaFetch<GammaEventRaw[]>("/events", { slug });
  if (!raw || raw.length === 0) return null;
  return normaliseEvent(raw[0]);
}
