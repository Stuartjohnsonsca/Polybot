import {
  getPersistenceStatus,
  loadBasketFromDb,
} from "@/lib/basket/server";
import BasketClient from "./BasketClient";

// Always re-fetch on each request — basket state is user-mutating and not
// safe to cache.
export const dynamic = "force-dynamic";

export default async function BasketPage() {
  const persistence = getPersistenceStatus();
  const initial = persistence.available ? await loadBasketFromDb() : null;
  return (
    <BasketClient
      initial={initial}
      persistenceAvailable={persistence.available}
      persistenceMessage={persistence.reason}
    />
  );
}
