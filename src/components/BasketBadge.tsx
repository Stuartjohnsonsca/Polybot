"use client";

import Link from "next/link";
import { useBasketLegCount } from "@/lib/basket/store";

export default function BasketBadge() {
  const count = useBasketLegCount();
  return (
    <Link
      href="/basket"
      className="relative rounded-md px-3 py-1.5 text-sm text-muted hover:bg-panel2 hover:text-text"
    >
      Basket
      {count > 0 && (
        <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-bg">
          {count}
        </span>
      )}
    </Link>
  );
}
