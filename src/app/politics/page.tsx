import { listEvents } from "@/lib/polymarket/gamma";
import type { PolyEvent } from "@/lib/polymarket/types";
import { dutchBookDistance, strongerSideSum } from "@/lib/hedge";
import EventCard from "@/components/EventCard";
import SectionHeader from "@/components/SectionHeader";
import SortControl, { parseSortKey, type SortKey } from "@/components/SortControl";

export const revalidate = 60;

const COMPUTED_SORTS: SortKey[] = ["strongerSum", "dutchEdge"];

export default async function PoliticsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const sort = parseSortKey((await searchParams).sort);
  let events: PolyEvent[] = [];
  let error: string | null = null;
  try {
    const computedSort = COMPUTED_SORTS.includes(sort);
    const apiOrder: "volume24hr" | "liquidity" | "endDate" = computedSort
      ? "volume24hr"
      : (sort as "volume24hr" | "liquidity" | "endDate");
    events = await listEvents({
      tagSlug: "politics",
      limit: computedSort ? 100 : 60,
      order: apiOrder,
      ascending: sort === "endDate",
    });
    if (sort === "strongerSum") events = applyComputedSort(events, strongerSideSum);
    else if (sort === "dutchEdge") events = applyComputedSort(events, dutchBookDistance);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div>
      <SectionHeader
        title="Politics"
        subtitle="Live politics events on Polymarket."
        count={events.length}
      />

      <div className="mb-5">
        <SortControl basePath="/politics" current={sort} />
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
        <p className="text-sm text-muted">No politics events found.</p>
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

// Re-export so we can pin this page's `sort` query value typing if needed.
export type { SortKey };
