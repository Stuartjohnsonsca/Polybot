import {
  getPersistenceStatus,
  loadBasketFromDb,
} from "@/lib/basket/server";
import BasketClient from "./BasketClient";

// Always re-fetch on each request — basket state is user-mutating and not
// safe to cache.
export const dynamic = "force-dynamic";

export default async function BasketPage() {
  let persistenceAvailable = false;
  let persistenceMessage: string | undefined;
  let initial = null;
  try {
    const persistence = getPersistenceStatus();
    persistenceAvailable = persistence.available;
    persistenceMessage = persistence.reason;
    if (persistenceAvailable) {
      initial = await loadBasketFromDb();
    }
  } catch (err) {
    console.error("[polybot] basket page server hydration failed:", err);
    persistenceAvailable = false;
    persistenceMessage =
      "Persistence is misconfigured (server-side error). Falling back to localStorage. Check the Vercel function logs for the underlying error.";
  }

  return (
    <BasketClient
      initial={initial}
      persistenceAvailable={persistenceAvailable}
      persistenceMessage={persistenceMessage}
    />
  );
}
