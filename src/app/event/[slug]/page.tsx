import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/polymarket/gamma";
import { summariseEvent } from "@/lib/hedge";
import { fmtUsd, fmtDate, daysUntil, fmtPrice } from "@/lib/format";

export const revalidate = 60;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const summary = summariseEvent(event);
  const days = daysUntil(event.endDate);
  const sortedMarkets = [...event.markets].sort(
    (a, b) => (b.yesPrice ?? 0) - (a.yesPrice ?? 0),
  );

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted">
        <Link href="/" className="hover:text-text">
          Home
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/politics" className="hover:text-text">
          events
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text">{event.title}</span>
      </div>

      <header className="rounded-lg border border-border bg-panel p-5">
        <h1 className="text-xl font-semibold tracking-tight">{event.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{event.markets.length} markets</span>
          <span>·</span>
          <span>vol {fmtUsd(event.volume, { compact: true })}</span>
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
              mutually exclusive
            </span>
          )}
        </div>
        {event.description && (
          <p className="mt-3 max-w-3xl text-sm text-muted">{event.description}</p>
        )}
        {event.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {event.tags.slice(0, 12).map((t) => (
              <span
                key={t.id}
                className="rounded bg-panel2 px-2 py-0.5 text-[11px] text-muted"
              >
                {t.label}
              </span>
            ))}
          </div>
        )}
      </header>

      {summary.mutuallyExclusive && summary.considered > 1 && (
        <section className="rounded-lg border border-border bg-panel p-5">
          <h2 className="text-sm font-medium text-muted">Hedge snapshot</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Σ Yes prices"
              value={`${(summary.yesPriceSum * 100).toFixed(1)}¢`}
              tone={summary.yesPriceSum > 1.005 ? "good" : undefined}
              hint={
                summary.yesPriceSum > 1.005
                  ? "Sum > 100¢: buying every No yields a guaranteed profit before fees."
                  : "Sum ≤ 100¢: market is consistent."
              }
            />
            <Stat
              label="No basket cost"
              value={
                summary.noBasketCost !== null
                  ? `${(summary.noBasketCost * 100).toFixed(1)}¢`
                  : "—"
              }
              hint="Total cost to buy 'No' on every leg, payout = (n-1)$ guaranteed if mutually exclusive."
            />
            <Stat
              label="Markets considered"
              value={summary.considered.toString()}
              hint="Markets in this event with a usable Yes price."
            />
            <Stat
              label="Dutch-book edge"
              value={
                summary.dutchBookEdge && summary.dutchBookEdge > 0
                  ? `+${(summary.dutchBookEdge * 100).toFixed(1)}¢`
                  : "—"
              }
              tone={summary.dutchBookEdge ? "good" : undefined}
              hint="Pre-fee edge if Σ Yes > 100¢. Liquidity and slippage will eat into this."
            />
          </div>
          <p className="mt-4 text-xs text-muted">
            Full LP-based optimiser (custom thesis, partial coverage, weighted
            outcomes) is the next milestone — this stub only flags the trivial
            mutually-exclusive case.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Markets</h2>
          <span className="text-xs text-muted">sorted by Yes price</span>
        </div>
        <ul className="divide-y divide-border">
          {sortedMarkets.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 text-sm"
            >
              <span className="truncate">{m.question}</span>
              <span className="font-mono text-xs text-muted">
                {fmtUsd(m.volume, { compact: true })}
              </span>
              <span className="font-mono text-xs text-muted">
                liq {fmtUsd(m.liquidity, { compact: true })}
              </span>
              <span className="w-16 text-right font-mono text-sm">
                {fmtPrice(m.yesPrice)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div title={hint}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-mono text-lg ${toneClass}`}>{value}</div>
    </div>
  );
}
