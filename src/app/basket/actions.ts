"use server";

import { optimiseBasket } from "@/lib/optimiser";
import type { Basket, OptimiseResult } from "@/lib/optimiser/types";

export async function runOptimisation(basket: Basket): Promise<OptimiseResult> {
  return optimiseBasket(basket);
}
