import { notFound } from "next/navigation";
import { listEvents } from "@/lib/polymarket/gamma";
import type { PolyEvent } from "@/lib/polymarket/types";
import { hedgeEdge } from "@/lib/hedge";
import EventCard from "@/components/EventCard";
import SectionHeader from "@/components/SectionHeader";
import SortControl, { parseSortKey, type SortKey } from "@/components/SortControl";
import { SECTIONS, getSectionById } from "@/lib/sections";

export const revalidate = 60;

const COMPUTED_SORTS: SortKey[] = ["hedgeEdge"];

// Pre-render every configured section at build time so the dynamic
// route still gets static-generation benefits.
export function generateStaticParams() {
  return SECTIONS.map((s) => ({ section: s.id }));
}

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const { section: sectionId } = await params;
  const config = getSectionById(sectionId);
  if (!config) notFound();

  const sort = parseSortKey((await searchParams).sort);
  let events: PolyEvent[] = [];
  let error: string | null = null;
  try {
    const computedSort = COMPUTED_SORTS.includes(sort);
    const apiOrder: "volume24hr" | "liquidity" | "endDate" = computedSort
      ? "volume24hr"
      : (sort as "volume24hr" | "liquidity" | "endDate");
    events = await listEvents({
      tagSlug: config.tagSlug,
      limit: computedSort ? 100 : 60,
      order: apiOrder,
      ascending: sort === "endDate",
    });
    if (sort === "hedgeEdge") events = applyComputedSort(events, hedgeEdge);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div>
      <SectionHeader
        title={config.label}
        subtitle={config.subtitle}
        count={events.length}
      />

      <div className="mb-5">
        <SortControl basePath={`/${config.id}`} current={sort} />
      </div>

      {error && (
        <div className="mb-4 rounded border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          Failed to load events: {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>

      {!error && events.length === 0 && (
        <p className="text-sm text-muted">
          No {config.label.toLowerCase()} events found right now. Polymarket&apos;s
          {" "}
          <code className="rounded bg-panel2 px-1 py-0.5 text-xs">
            {config.tagSlug}
          </code>{" "}
          tag may simply have no live events at the moment.
        </p>
      )}
    </div>
  );
}

function applyComputedSort(
  events: PolyEvent[],
  score: (e: PolyEvent) => number,
): PolyEvent[] {
  return [...events].sort((a, b) => score(b) - score(a));
}
