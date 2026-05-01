"use client";

// One-click basket construction from an auto-detected hedge opportunity.
// Replaces the user's current basket (with confirmation) with the legs
// of the picked event and a thesis matching the mutex Dutch-book setup
// (`exactly 1 YES`), then persists to the DB and navigates to /basket
// where the auto-solve fires with full orderbook ladders.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addLegToBasket,
  clearBasket,
  getBasketSnapshot,
  setThesisPredicates,
} from "@/lib/basket/store";
import { persistBasket } from "@/app/basket/actions";
import type { Section } from "@/lib/polymarket/types";
import type { OpportunityLeg } from "@/lib/opportunities";
import type { ThesisPredicate } from "@/lib/optimiser/types";

export interface BuildBasketButtonProps {
  legs: OpportunityLeg[];
  section: Section;
  eventTitle: string;
  // Thesis the LP picked as best for this opportunity. Falls back to
  // strict mutex if not supplied.
  thesisPredicates?: ThesisPredicate[];
  size?: "sm" | "md";
}

export default function BuildBasketButton({
  legs,
  section,
  eventTitle,
  thesisPredicates,
  size = "md",
}: BuildBasketButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handle = () => {
    setError(null);
    const existing = getBasketSnapshot();
    if (existing && existing.legs.length > 0) {
      const ok = window.confirm(
        `Replace your current basket (${existing.legs.length} legs) with ${legs.length} legs from "${eventTitle}"?`,
      );
      if (!ok) return;
    }

    startTransition(async () => {
      try {
        clearBasket();
        for (const leg of legs) {
          addLegToBasket({ ...leg, section });
        }
        // Use the LP-picked thesis if supplied — falls back to strict
        // mutex ("exactly 1 YES") for callers that haven't run the
        // multi-thesis explorer.
        setThesisPredicates(
          thesisPredicates && thesisPredicates.length > 0
            ? thesisPredicates
            : [{ kind: "exactlyK", k: 1 }],
        );

        const snap = getBasketSnapshot();
        if (snap) {
          // Force-flush to the server so the next /basket render hydrates
          // with the new basket (the store's debounced push would race
          // with the navigation).
          await persistBasket(snap).catch(() => {
            /* persistence is optional — localStorage is already updated */
          });
        }
        router.push("/basket");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to construct basket");
      }
    });
  };

  const cls =
    size === "md"
      ? "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90 disabled:opacity-50"
      : "rounded bg-accent px-3 py-1 text-xs font-semibold text-bg hover:bg-accent/90 disabled:opacity-50";

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={handle} disabled={pending} className={cls}>
        {pending ? "Building…" : "Construct & solve →"}
      </button>
      {error && <span className="text-[10px] text-bad">{error}</span>}
    </span>
  );
}
