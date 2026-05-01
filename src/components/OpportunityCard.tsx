import Link from "next/link";
import type { HedgeOpportunity } from "@/lib/opportunities";
import { legsForOpportunity } from "@/lib/opportunities";
import BuildBasketButton from "./BuildBasketButton";
import { fmtDate, daysUntil, fmtUsd, fmtPrice } from "@/lib/format";

export default function OpportunityCard({
  opportunity,
}: {
  opportunity: HedgeOpportunity;
}) {
  const { event, edge, direction, legCount, yesPriceSum, section, estReturnPct, lp, lpReturnPct } =
    opportunity;
  const days = daysUntil(event.endDate);
  const directionLabel =
    direction === "BUY_ALL_NO" ? "BUY NO on every leg" : "BUY YES on every leg";
  const directionRationale =
    direction === "BUY_ALL_NO"
      ? `Σ Yes = ${(yesPriceSum * 100).toFixed(1)}¢ > 100¢ → exactly one leg resolves YES, so n−1 NO positions always win.`
      : `Σ Yes = ${(yesPriceSum * 100).toFixed(1)}¢ < 100¢ → exactly one leg resolves YES, so one YES position always wins.`;

  const lpFeasible = lp?.feasible === true && lp.legStakes.length > 0;
  const lpHasResult = !!lp;

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium" title={event.title}>
            {event.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{legCount} markets</span>
            <span>·</span>
            <span className="capitalize">{section}</span>
            <span>·</span>
            <span>
              ends {fmtDate(event.endDate)}
              {days !== null && days >= 0 ? ` (${days}d)` : ""}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 rounded bg-good/15 px-3 py-1 font-mono text-sm font-semibold text-good"
          title="Pre-fee, mid-price arbitrage edge per dollar of payout coverage"
        >
          +{(edge * 100).toFixed(1)}¢
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Hedge direction" value={directionLabel} tone="accent" />
        <Stat
          label="Mid-price return"
          value={`${(estReturnPct * 100).toFixed(2)}%`}
          mono
          hint="Estimated profit / staked at mid prices, before slippage"
        />
        <Stat
          label="LP return (live book)"
          value={
            lpReturnPct !== undefined
              ? `${(lpReturnPct * 100).toFixed(2)}%`
              : lpHasResult
                ? "—"
                : "click to solve"
          }
          tone={
            lpReturnPct !== undefined && lpReturnPct > 0
              ? "good"
              : lpReturnPct !== undefined && lpReturnPct <= 0
                ? "bad"
                : undefined
          }
          mono
          hint="Achievable return from the LP solver against live orderbook depth (only top 10 candidates are auto-solved)"
        />
      </div>

      <p className="mt-3 text-xs text-muted" title={directionRationale}>
        Why this hedge works: {directionRationale}
      </p>

      {lpHasResult && (
        <div className="mt-4 rounded border border-border bg-panel2/50">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
            <span className="font-medium">
              Proposed trades{" "}
              <span className="text-muted">($100 budget · LP-solved)</span>
            </span>
            {lpFeasible && (
              <span className="font-mono text-muted">
                worst-case +{fmtUsd(lp.worstCaseProfit, { compact: false })} on{" "}
                {fmtUsd(lp.totalStaked, { compact: false })} staked
              </span>
            )}
          </div>
          {lpFeasible ? (
            <ul className="divide-y divide-border">
              {lp.legStakes.map((s) => (
                <li
                  key={`${s.marketId}-${s.side}`}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs"
                >
                  <span
                    className={`rounded px-2 py-0.5 font-bold tracking-wide ${
                      s.side === "YES"
                        ? "bg-good/20 text-good"
                        : "bg-accent2/20 text-accent2"
                    }`}
                  >
                    BUY {s.side}
                  </span>
                  <span className="truncate text-muted">{s.question}</span>
                  <span className="font-mono text-muted">
                    @ {fmtPrice(s.averagePrice)}
                  </span>
                  <span className="w-16 text-right font-mono">
                    {fmtUsd(s.totalDollars, { compact: false })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-xs">
              {lp?.warnings && lp.warnings.length > 0 ? (
                <ul className="space-y-1">
                  {lp.warnings.map((w, i) => (
                    <li
                      key={i}
                      className={
                        w.level === "warn" ? "text-bad" : "text-muted"
                      }
                    >
                      {w.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">
                  LP couldn&apos;t produce a profitable basket against the
                  current orderbook. Liquidity may be too thin for the
                  mid-price edge to survive slippage.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Link
          href={`/event/${event.slug}`}
          className="text-xs text-muted hover:text-text"
        >
          View underlying markets →
        </Link>
        <BuildBasketButton
          legs={legsForOpportunity(opportunity)}
          section={section}
          eventTitle={event.title}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  mono,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "accent";
  mono?: boolean;
  hint?: string;
}) {
  const valueClass =
    tone === "good"
      ? "text-good"
      : tone === "bad"
        ? "text-bad"
        : tone === "accent"
          ? "text-accent2"
          : "text-text";
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 ${mono ? "font-mono" : ""} text-sm font-medium ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}
