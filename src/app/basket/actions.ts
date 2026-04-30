"use server";

import { optimiseBasket } from "@/lib/optimiser";
import type { Basket, OptimiseResult } from "@/lib/optimiser/types";
import { loadBasketFromDb, saveBasketToDb } from "@/lib/basket/server";

export async function runOptimisation(basket: Basket): Promise<OptimiseResult> {
  return optimiseBasket(basket);
}

export async function persistBasket(basket: Basket | null): Promise<{ ok: boolean }> {
  const ok = await saveBasketToDb(basket);
  return { ok };
}

export async function fetchBasket(): Promise<Basket | null> {
  return loadBasketFromDb();
}
