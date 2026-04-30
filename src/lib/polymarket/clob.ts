// CLOB orderbook client. Polymarket exposes one orderbook per CLOB token
// (each binary market has two tokens — one for YES, one for NO). The book
// returns bids and asks as { price: string, size: string } where:
//   - asks[] are sorted descending: best (lowest) ask is the LAST entry
//   - bids[] are sorted ascending:  best (highest) bid is the LAST entry
// We normalise both to "best first" (asks ascending, bids descending) so
// the LP and UI can iterate cheap → expensive.

const CLOB_BASE = process.env.CLOB_API_BASE ?? "https://clob.polymarket.com";

export interface RawLevel {
  price: string;
  size: string;
}

export interface RawBook {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: RawLevel[];
  asks: RawLevel[];
}

export interface BookLevel {
  price: number; // 0 < price < 1
  size: number; // shares
  dollarDepth: number; // size * price (asks) or size * (1-price) (bids)
}

export interface NormalisedBook {
  tokenId: string;
  // Sorted by best price first (cheapest ask, highest bid).
  asks: BookLevel[];
  bids: BookLevel[];
  fetchedAt: number; // epoch ms
}

export async function fetchOrderbook(tokenId: string): Promise<NormalisedBook> {
  const url = new URL(`${CLOB_BASE}/book`);
  url.searchParams.set("token_id", tokenId);
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`CLOB ${res.status} ${res.statusText} for token ${tokenId}`);
  }
  const raw = (await res.json()) as RawBook;
  return normaliseBook(tokenId, raw);
}

export async function fetchOrderbooks(
  tokenIds: string[],
): Promise<Record<string, NormalisedBook>> {
  const results = await Promise.all(
    tokenIds.map(async (id) => {
      try {
        return [id, await fetchOrderbook(id)] as const;
      } catch (err) {
        console.error(`Failed to fetch CLOB book for ${id}:`, err);
        return [id, emptyBook(id)] as const;
      }
    }),
  );
  return Object.fromEntries(results);
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normaliseBook(tokenId: string, raw: RawBook): NormalisedBook {
  // Asks: convert + sort ascending by price (cheapest first).
  const asks: BookLevel[] = (raw.asks ?? [])
    .map((l) => {
      const price = num(l.price);
      const size = num(l.size);
      return { price, size, dollarDepth: size * price };
    })
    .filter((l) => l.price > 0 && l.price < 1 && l.size > 0)
    .sort((a, b) => a.price - b.price);

  // Bids: convert + sort descending by price (highest first).
  const bids: BookLevel[] = (raw.bids ?? [])
    .map((l) => {
      const price = num(l.price);
      const size = num(l.size);
      return { price, size, dollarDepth: size * (1 - price) };
    })
    .filter((l) => l.price > 0 && l.price < 1 && l.size > 0)
    .sort((a, b) => b.price - a.price);

  return { tokenId, asks, bids, fetchedAt: Date.now() };
}

function emptyBook(tokenId: string): NormalisedBook {
  return { tokenId, asks: [], bids: [], fetchedAt: Date.now() };
}
