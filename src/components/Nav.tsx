import Link from "next/link";
import BasketBadge from "./BasketBadge";

export default function Nav() {
  return (
    <header className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="font-semibold tracking-tight">Polybot</span>
          <span className="text-xs text-muted">hedge explorer</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/politics"
            className="rounded-md px-3 py-1.5 text-muted hover:bg-panel2 hover:text-text"
          >
            Politics
          </Link>
          <Link
            href="/forex"
            className="rounded-md px-3 py-1.5 text-muted hover:bg-panel2 hover:text-text"
          >
            Forex
          </Link>
          <Link
            href="/sports"
            className="rounded-md px-3 py-1.5 text-muted hover:bg-panel2 hover:text-text"
          >
            Sports
          </Link>
          <BasketBadge />
        </nav>
      </div>
    </header>
  );
}
