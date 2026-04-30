# Polybot

Polymarket hedge explorer. Browse live events on Polymarket, drill into the
underlying markets, and surface correlated baskets where a small set of legs
can hedge most of the outcome space.

**Display-only. No order execution.**

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS
- Polymarket Gamma API (public, no key required)
- Deployed on Railway

## What it does today

- Two sections: **Politics** and **Forex**, populated from the Gamma API
  (`tag_slug=politics`, `tag_slug=forex`).
- Each section lists active events, sorted by 24h volume, refreshed every
  ~60 seconds via Next's data cache.
- Event detail page shows every underlying market with its Yes price,
  volume, and liquidity.
- For mutually-exclusive events (Polymarket's `negRisk` flag), the detail
  page computes:
  - Σ Yes prices across legs
  - No-basket cost (buy "No" on every leg → guaranteed `(n−1)$` payout)
  - Dutch-book edge if Σ Yes > 100¢
- Event cards flag any event already showing a Dutch-book edge.

## What it doesn't do yet

- No optimiser. The hedge snapshot only handles the trivial mutually-
  exclusive case; the next milestone is an LP-based optimiser that takes a
  user-supplied thesis (e.g. "at most one of these resolves Yes") across
  *different* events and finds bet sizes that maximise worst-case payout.
- No persistence. Markets are fetched on-demand, no historical snapshots.
- No cross-event grouping. Today's grouping is just by Polymarket's own
  event boundary; cross-event clustering by topic / embeddings is on the
  roadmap.
- No order execution. By design, until the signal quality is trusted.

## Local dev

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploying

### Vercel (current)

1. Import the repo from the Vercel dashboard.
2. Defaults work — Next.js 15 is auto-detected.
3. **Enable basket persistence** (one-time):
   - In the project, **Storage → Create → Neon Postgres**.
   - Connect it to the project; Vercel injects `DATABASE_URL` automatically.
   - Redeploy. The first basket save will create the schema on demand
     (`CREATE TABLE IF NOT EXISTS baskets`).
4. Without a database connected, the app still runs — the basket falls
   back to localStorage and a banner shows on `/basket`.

### Railway (alternative)

1. Connect this repo to a Railway project.
2. Railway auto-detects Node and builds via `nixpacks.toml`.
3. Railway sets `PORT` automatically; `npm run start` honours it.
4. For persistence, add a Postgres service and set `DATABASE_URL`.

## Project layout

```
src/
├─ app/
│  ├─ layout.tsx            shell + nav
│  ├─ page.tsx              landing
│  ├─ politics/page.tsx     events list (tag_slug=politics)
│  ├─ forex/page.tsx        events list (tag_slug=forex)
│  └─ event/[slug]/page.tsx event detail + hedge snapshot
├─ components/
│  ├─ Nav.tsx
│  ├─ EventCard.tsx
│  └─ SectionHeader.tsx
└─ lib/
   ├─ format.ts             currency / pct / date helpers
   ├─ hedge.ts               summariseEvent — Dutch-book detection
   └─ polymarket/
      ├─ types.ts            normalised + raw types
      └─ gamma.ts             Gamma API client (listEvents, getEventBySlug)
```

## Roadmap

1. **Custom thesis builder** — pick markets across events, define a
   constraint ("at most 1 of these resolves Yes"), solve for stake weights.
2. **Cross-event grouping** — embed event titles + descriptions, cluster
   semantically related events.
3. **Historical snapshots** — Postgres on Railway, persist orderbook +
   price history for backtesting.
4. **Order execution** — CLOB API + Polygon proxy wallet. Last, not first.
