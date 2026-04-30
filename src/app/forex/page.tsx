import { listEvents } from "@/lib/polymarket/gamma";
import type { PolyEvent } from "@/lib/polymarket/types";
import EventCard from "@/components/EventCard";
import SectionHeader from "@/components/SectionHeader";

export const revalidate = 60;

export default async function ForexPage() {
  let events: PolyEvent[] = [];
  let error: string | null = null;
  try {
    events = await listEvents({ tagSlug: "forex", limit: 60 });
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div>
      <SectionHeader
        title="Forex"
        subtitle="Currency-pair and FX-rate events on Polymarket, sorted by 24h volume."
        count={events.length}
      />

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
          No forex events found. Polymarket&apos;s FX catalogue is thin —
          check back when ECB/Fed weeks come around.
        </p>
      )}
    </div>
  );
}
