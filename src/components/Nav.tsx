import Link from "next/link";
import BasketBadge from "./BasketBadge";
import { SECTIONS } from "@/lib/sections";

export default function Nav() {
  return (
    <header className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="font-semibold tracking-tight">Polybot</span>
          <span className="hidden text-xs text-muted sm:inline">hedge explorer</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 text-sm">
          {SECTIONS.map((s) => (
            <Link
              key={s.id}
              href={`/${s.id}`}
              className="rounded-md px-2.5 py-1.5 text-muted hover:bg-panel2 hover:text-text"
            >
              {s.label}
            </Link>
          ))}
          <BasketBadge />
        </nav>
      </div>
    </header>
  );
}
