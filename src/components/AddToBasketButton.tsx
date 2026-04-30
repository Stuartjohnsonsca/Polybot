"use client";

import { useState, useTransition } from "react";
import {
  addLegToBasket,
  removeLegFromBasket,
  useBasket,
} from "@/lib/basket/store";
import type { Section } from "@/lib/polymarket/types";

export interface AddToBasketButtonProps {
  marketId: string;
  question: string;
  yesPrice: number | null;
  yesTokenId: string | null;
  noTokenId: string | null;
  section: Section;
  size?: "sm" | "md";
}

export default function AddToBasketButton({
  marketId,
  question,
  yesPrice,
  yesTokenId,
  noTokenId,
  section,
  size = "sm",
}: AddToBasketButtonProps) {
  const basket = useBasket();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inBasket = basket?.legs.some((l) => l.marketId === marketId) ?? false;
  const wrongSection = !!basket && basket.legs.length > 0 && basket.section !== section;

  const handle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(() => {
      if (inBasket) {
        removeLegFromBasket(marketId);
        return;
      }
      const r = addLegToBasket({
        marketId,
        question,
        yesPrice,
        yesTokenId,
        noTokenId,
        section,
      });
      if (!r.ok) {
        if (r.reason === "section-conflict") {
          setError(`Basket is locked to ${basket?.section}.`);
        } else if (r.reason === "duplicate") {
          setError("Already in basket.");
        }
      }
    });
  };

  const base =
    size === "md"
      ? "h-8 rounded-md px-3 text-sm font-medium"
      : "h-7 rounded px-2 text-xs font-medium";

  if (wrongSection) {
    return (
      <button
        type="button"
        disabled
        className={`${base} cursor-not-allowed border border-border bg-panel2 text-muted/60`}
        title={`Basket is locked to ${basket?.section}. Clear it to mix sections.`}
      >
        section locked
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handle}
        className={`${base} ${
          inBasket
            ? "border border-accent bg-accent/15 text-accent hover:bg-accent/25"
            : "border border-border bg-panel2 text-muted hover:border-accent hover:text-text"
        }`}
      >
        {inBasket ? "✓ in basket" : "+ basket"}
      </button>
      {error && <span className="text-[10px] text-bad">{error}</span>}
    </span>
  );
}
