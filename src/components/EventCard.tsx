import Link from "next/link";
import type { PolyEvent } from "@/lib/polymarket/types";
import { summariseEvent } from "@/lib/hedge";
import { fmtUsd, fmtDate, daysUntil, fmtPrice } from "@/lib/format";

export default function EventCard({ event }: { event: PolyEvent }) {
  const summary = summariseEvent(event);
  const days = daysUntil(event.endDate);
  const topMarkets = [...event.markets]
    .sort((a, b) => (b.yesPrice ?? 0) - (a.yesPrice ?? 0))
    .slice(0, 3);

  return (
    <Link
      href={`/event/${event.slug}`}
      className="block rounded-lg border border-border bg-panel p-4 transition hover:border-accent/50 hover:bg-panel2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-medium">{event.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{event.markets.length} markets</span>
            <span>·</span>
            <span>24h {fmtUsd(event.volume24hr, { compact: true })}</span>
            <span>·</span>
            <span>liq {fmtUsd(event.liquidity, { compact: true })}</span>
            {event.endDate && (
              <>
                <span>·</span>
                <span>
                  ends {fmtDate(event.endDate)}
                  {days !== null && days >= 0 ? ` (${days}d)` : ""}
                </span>
              </>
            )}
            {event.negRisk && (
              <span className="rounded bg-accent2/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent2">
                mutex
              </span>
            )}
          </div>
        </div>
        {summary.dutchBookEdge && summary.dutchBookEdge > 0 ? (
          <span
            className="shrink-0 rounded bg-good/15 px-2 py-0.5 text-xs font-semibold text-good"
            title="Sum of Yes prices > $1 across mutually exclusive markets"
          >
            +{(summary.dutchBookEdge * 100).toFixed(1)}¢
          </span>
        ) : null}
      </div>

      {topMarkets.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {topMarkets.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3">
              <span className="truncate text-muted">{m.question}</span>
              <span className="shrink-0 font-mono text-xs">{fmtPrice(m.yesPrice)}</span>
            </li>
          ))}
          {event.markets.length > topMarkets.length && (
            <li className="text-xs text-muted/70">
              + {event.markets.length - topMarkets.length} more
            </li>
          )}
        </ul>
      )}

      {summary.mutuallyExclusive && summary.considered > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted">
          <span>Σ Yes prices</span>
          <span className={summary.yesPriceSum > 1.005 ? "text-good" : "text-text"}>
            {(summary.yesPriceSum * 100).toFixed(1)}¢
          </span>
        </div>
      )}
    </Link>
  );
}
