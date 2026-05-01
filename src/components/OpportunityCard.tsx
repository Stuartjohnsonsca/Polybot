import Link from "next/link";
import type { HedgeOpportunity } from "@/lib/opportunities";
import { legsForOpportunity } from "@/lib/opportunities";
import BuildBasketButton from "./BuildBasketButton";
import { fmtDate, daysUntil } from "@/lib/format";

export default function OpportunityCard({
  opportunity,
}: {
  opportunity: HedgeOpportunity;
}) {
  const { event, edge, direction, legCount, yesPriceSum, section, estReturnPct } =
    opportunity;
  const days = daysUntil(event.endDate);
  const directionLabel =
    direction === "BUY_ALL_NO" ? "BUY NO on every leg" : "BUY YES on every leg";
  const directionRationale =
    direction === "BUY_ALL_NO"
      ? `Σ Yes = ${(yesPriceSum * 100).toFixed(1)}¢ > 100¢ → exactly one leg resolves YES, so n−1 NO positions always win.`
      : `Σ Yes = ${(yesPriceSum * 100).toFixed(1)}¢ < 100¢ → exactly one leg resolves YES, so one YES position always wins.`;

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
          label="Σ Yes prices"
          value={`${(yesPriceSum * 100).toFixed(1)}¢`}
          mono
        />
        <Stat
          label="Est. return on capital"
          value={`${(estReturnPct * 100).toFixed(2)}%`}
          tone="good"
          mono
        />
      </div>

      <p className="mt-3 text-xs text-muted" title={directionRationale}>
        Why this hedge works: {directionRationale}
      </p>

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
}: {
  label: string;
  value: string;
  tone?: "good" | "accent";
  mono?: boolean;
}) {
  const valueClass =
    tone === "good"
      ? "text-good"
      : tone === "accent"
        ? "text-accent2"
        : "text-text";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 ${mono ? "font-mono" : ""} text-sm font-medium ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}
