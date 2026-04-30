import Link from "next/link";

export type SortKey =
  | "volume24hr"
  | "liquidity"
  | "endDate"
  | "strongerSum"
  | "dutchEdge";

export const SORT_OPTIONS: { key: SortKey; label: string; tooltip: string }[] = [
  { key: "volume24hr", label: "24h volume", tooltip: "Most actively traded over the last 24 hours" },
  { key: "liquidity", label: "Liquidity", tooltip: "Deepest order books first" },
  { key: "endDate", label: "Ending soonest", tooltip: "Resolves earliest first" },
  {
    key: "strongerSum",
    label: "Σ stronger side",
    tooltip:
      "Σ max(p, 1−p) across legs — picks the more-likely side per market (YES if p>0.5, NO otherwise) and sums those probabilities",
  },
  {
    key: "dutchEdge",
    label: "Dutch-book edge",
    tooltip:
      "For mutually-exclusive events: |Σ Yes − 1|, descending. Surfaces both Σ>1 (buy all NOs) and Σ<1 (buy all YESs) arbitrage opportunities",
  },
];

const VALID: SortKey[] = [
  "volume24hr",
  "liquidity",
  "endDate",
  "strongerSum",
  "dutchEdge",
];

export function parseSortKey(value: string | string[] | undefined): SortKey {
  const v = Array.isArray(value) ? value[0] : value;
  return VALID.includes(v as SortKey) ? (v as SortKey) : "volume24hr";
}

export default function SortControl({
  basePath,
  current,
}: {
  basePath: string;
  current: SortKey;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 text-muted">Sort:</span>
      {SORT_OPTIONS.map((o) => {
        const href = o.key === "volume24hr" ? basePath : `${basePath}?sort=${o.key}`;
        const active = current === o.key;
        return (
          <Link
            key={o.key}
            href={href}
            title={o.tooltip}
            className={`rounded px-2.5 py-1 transition ${
              active
                ? "bg-accent2/20 text-accent2"
                : "bg-panel2 text-muted hover:text-text"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
