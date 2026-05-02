import Link from "next/link";
import { findHedgeOpportunities } from "@/lib/opportunities";
import type { HedgeOpportunity } from "@/lib/opportunities";
import OpportunityCard from "@/components/OpportunityCard";
import { SECTIONS } from "@/lib/sections";

// Each request runs LP solves against live orderbooks, so we cache for
// 60s. The first request after expiry takes ~5–10s while it solves the
// top candidates; subsequent requests within the window are instant.
export const revalidate = 60;

const TOP_N = 10;

export default async function Home() {
  let opportunities: HedgeOpportunity[] = [];
  let error: string | null = null;
  try {
    opportunities = await findHedgeOpportunities();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch events";
  }
  const top = opportunities.slice(0, TOP_N);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Top hedge opportunities
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Mutually-exclusive Polymarket events whose Yes prices currently
          sum to ≠ 100¢, ranked by estimated risk-free return on capital.
          Each card has been pre-solved by the LP optimiser against the
          live orderbook — the proposed trades and achievable return are
          shown inline, so you can scan the list and pick what to act on.
          Click <em>Construct &amp; solve</em> to drop a candidate into
          your basket for full detail.
        </p>
      </header>

      {error && (
        <div className="rounded border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </div>
      )}

      {top.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel p-6 text-sm text-muted">
          <p>
            No hedge opportunities right now — every mutex event we scanned
            is priced within 0.5¢ of arbitrage-free. Check back; pricing
            shifts when liquidity moves around political events and
            scheduled FX releases.
          </p>
          <p className="mt-3">
            You can still browse the catalogue manually:{" "}
            {SECTIONS.map((s, i) => (
              <span key={s.id}>
                {i > 0 && " · "}
                <Link href={`/${s.id}`} className="underline">
                  {s.label}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {top.map((o) => (
              <OpportunityCard key={o.event.id} opportunity={o} />
            ))}
          </div>

          <p className="text-xs text-muted">
            Showing top {top.length} of {opportunities.length} candidates ·
            mid-price edges are pre-fee estimates · LP returns reflect
            $100 sized against live orderbook depth · refreshed every 60s.
          </p>
        </>
      )}

      <section className="rounded-lg border border-border bg-panel/50 p-5 text-sm text-muted">
        <h3 className="mb-2 font-medium text-text">How this works</h3>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong className="text-text">Mutex events</strong> — Polymarket
            flags certain events (e.g.{" "}
            <em>&quot;Who will win election X?&quot;</em>) as
            mutually-exclusive: exactly one of the markets resolves YES.
          </li>
          <li>
            When the implied Yes prices sum to <strong>more than 100¢</strong>,
            buying NO on every leg pays a guaranteed{" "}
            <code className="font-mono">n−1</code> dollars (since exactly{" "}
            <code className="font-mono">n−1</code> legs resolve NO). Edge ={" "}
            <code className="font-mono">Σ Yes − 1</code>.
          </li>
          <li>
            When the sum is <strong>less than 100¢</strong>, buying YES on
            every leg pays a guaranteed $1 (the one winner). Edge ={" "}
            <code className="font-mono">1 − Σ Yes</code>.
          </li>
          <li>
            Both strategies are <em>self-hedging</em> — the trades cancel
            each other&apos;s directional exposure via the mutex
            constraint, leaving only the pricing edge as profit.
          </li>
          <li>
            <strong className="text-text">Residual risks</strong> the LP
            doesn&apos;t hedge: resolution-criteria ambiguity, liquidity
            below the displayed depth, and Polymarket platform / oracle
            risk.
          </li>
        </ul>
      </section>
    </div>
  );
}
