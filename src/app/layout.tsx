import "./globals.css";
import type { Metadata } from "next";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Polybot — Polymarket hedge explorer",
  description:
    "Browse Polymarket events, find correlated markets, and surface multi-leg hedge opportunities across Politics and Forex.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted">
          Data: Polymarket Gamma API. Display-only — no order execution.
        </footer>
      </body>
    </html>
  );
}
