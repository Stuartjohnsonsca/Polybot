import Link from "next/link";

export const dynamic = "force-static";

const SECTIONS = [
  {
    href: "/politics",
    title: "Politics",
    blurb:
      "Elections, leadership challenges, geopolitical events. The deepest category on Polymarket and the richest hunting ground for correlated multi-leg hedges.",
  },
  {
    href: "/forex",
    title: "Forex",
    blurb:
      "Currency-pair price targets and central-bank-driven outcomes. Smaller catalogue but tightly defined resolution criteria.",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-panel p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Polymarket hedge explorer</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Browse live events, drill into the underlying markets, and surface
          correlated baskets where a small set of legs can hedge most of the
          outcome space. Display-only — no order execution.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-lg border border-border bg-panel p-5 transition hover:border-accent/60 hover:bg-panel2"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{s.title}</h2>
              <span className="text-muted group-hover:text-accent">→</span>
            </div>
            <p className="mt-2 text-sm text-muted">{s.blurb}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-panel/50 p-5 text-sm text-muted">
        <h3 className="mb-2 font-medium text-text">What this tool does today</h3>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            Pulls live events from the Polymarket Gamma API, refreshed every
            ~60 seconds.
          </li>
          <li>
            Flags <span className="text-good">Dutch-book opportunities</span> on
            mutually-exclusive events (Σ Yes prices &gt; 100¢).
          </li>
          <li>
            Drill into any event to see all underlying markets and a hedge
            calculator stub.
          </li>
        </ul>
      </section>
    </div>
  );
}
