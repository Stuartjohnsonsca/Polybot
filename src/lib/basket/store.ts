"use client";

// Client-side basket store with write-through to server-side Postgres.
// localStorage acts as a fast cache; every mutation also fires a debounced
// server-action so the basket survives across browsers and deploys.

import { useSyncExternalStore } from "react";
import type {
  Basket,
  BasketLeg,
  Side,
  Thesis,
  ThesisPredicate,
} from "@/lib/optimiser/types";
import type { Section } from "@/lib/polymarket/types";
import { persistBasket } from "@/app/basket/actions";

const STORAGE_KEY = "polybot:basket:v1";
const SERVER_PUSH_DEBOUNCE_MS = 600;

const DEFAULT_BUDGET = 1000;

const DEFAULT_THESIS: Thesis = {
  predicates: [],
  scenarioProbabilities: undefined,
};

function emptyBasket(section: Section): Basket {
  return {
    id: "default",
    name: "Working basket",
    section,
    legs: [],
    thesis: DEFAULT_THESIS,
    budget: DEFAULT_BUDGET,
  };
}

let cached: Basket | null = null;
const listeners = new Set<() => void>();

function read(): Basket | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Basket;
    cached = parsed;
    return parsed;
  } catch {
    return null;
  }
}

let serverPushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingServerPayload: Basket | null = null;

function schedulePush(b: Basket | null) {
  pendingServerPayload = b;
  if (serverPushTimer) clearTimeout(serverPushTimer);
  serverPushTimer = setTimeout(() => {
    const payload = pendingServerPayload;
    pendingServerPayload = null;
    serverPushTimer = null;
    persistBasket(payload).catch((err) => {
      console.error("[polybot] persistBasket failed:", err);
    });
  }, SERVER_PUSH_DEBOUNCE_MS);
}

function write(b: Basket | null) {
  cached = b;
  if (typeof window === "undefined") return;
  if (b === null) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  for (const l of listeners) l();
  schedulePush(b);
}

// Bypass schedulePush — used during initial server-side hydration so we
// don't immediately push the just-loaded value back to the server.
function writeWithoutSync(b: Basket | null) {
  cached = b;
  if (typeof window === "undefined") return;
  if (b === null) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  for (const l of listeners) l();
}

export function hydrateFromServer(b: Basket | null) {
  // Only overwrite if we don't already have local state — avoids
  // clobbering optimistic updates made before hydration completed.
  if (read() === null) writeWithoutSync(b);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Cross-tab sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cached = null;
      cb();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useBasket(): Basket | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function useBasketLegCount(): number {
  return useBasket()?.legs.length ?? 0;
}

export interface AddLegInput {
  marketId: string;
  question: string;
  yesPrice: number | null;
  yesTokenId: string | null;
  noTokenId: string | null;
  preferredSide?: Side;
  section: Section;
}

export type AddLegResult =
  | { ok: true }
  | { ok: false; reason: "section-conflict" | "duplicate" };

export function addLegToBasket(input: AddLegInput): AddLegResult {
  const current = read();
  if (current && current.legs.length > 0 && current.section !== input.section) {
    return { ok: false, reason: "section-conflict" };
  }
  const basket = current ?? emptyBasket(input.section);
  if (basket.legs.some((l) => l.marketId === input.marketId)) {
    return { ok: false, reason: "duplicate" };
  }
  const leg: BasketLeg = {
    marketId: input.marketId,
    question: input.question,
    yesPrice: input.yesPrice,
    yesTokenId: input.yesTokenId,
    noTokenId: input.noTokenId,
    preferredSide: input.preferredSide ?? "EITHER",
  };
  write({ ...basket, section: input.section, legs: [...basket.legs, leg] });
  return { ok: true };
}

export function removeLegFromBasket(marketId: string) {
  const current = read();
  if (!current) return;
  const next = { ...current, legs: current.legs.filter((l) => l.marketId !== marketId) };
  if (next.legs.length === 0) {
    // Reset thesis-with-probabilities when the basket empties.
    next.thesis = DEFAULT_THESIS;
  }
  write(next);
}

export function updateLeg(marketId: string, patch: Partial<BasketLeg>) {
  const current = read();
  if (!current) return;
  write({
    ...current,
    legs: current.legs.map((l) => (l.marketId === marketId ? { ...l, ...patch } : l)),
  });
}

export function setBudget(amount: number) {
  const current = read();
  if (!current) return;
  write({ ...current, budget: Math.max(0, amount) });
}

export function setThesisPredicates(predicates: ThesisPredicate[]) {
  const current = read();
  if (!current) return;
  // When predicates change, scenario keys change → blow away probabilities.
  write({
    ...current,
    thesis: { predicates, scenarioProbabilities: undefined },
  });
}

export function setScenarioProbabilities(probs: Record<string, number> | undefined) {
  const current = read();
  if (!current) return;
  write({
    ...current,
    thesis: { ...current.thesis, scenarioProbabilities: probs },
  });
}

export function clearBasket() {
  write(null);
}

export function getBasketSnapshot(): Basket | null {
  return read();
}
