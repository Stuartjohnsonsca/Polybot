// Server-side basket persistence via Neon (Vercel's native Postgres
// integration). The schema is intentionally tiny — one row per named
// basket, the entire basket payload stored as JSONB. We use `default`
// as the canonical key for the single-user case.
//
// The neon SDK is dynamically imported so a missing/broken module never
// crashes the server-component render — every persistence helper is
// non-throwing and returns null/false on any failure path.

import type { Basket } from "@/lib/optimiser/types";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.NEON_DATABASE_URL ??
  null;

let schemaEnsured = false;

type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

let cachedSql: SqlClient | null = null;
let sqlInitErrorLogged = false;

async function getSql(): Promise<SqlClient | null> {
  if (!DATABASE_URL) return null;
  if (cachedSql) return cachedSql;
  try {
    const mod = await import("@neondatabase/serverless");
    cachedSql = mod.neon(DATABASE_URL) as unknown as SqlClient;
    return cachedSql;
  } catch (err) {
    if (!sqlInitErrorLogged) {
      console.error("[polybot] failed to load @neondatabase/serverless:", err);
      sqlInitErrorLogged = true;
    }
    return null;
  }
}

async function ensureSchema(): Promise<boolean> {
  if (schemaEnsured) return true;
  const sql = await getSql();
  if (!sql) return false;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS baskets (
        id          TEXT PRIMARY KEY,
        data        JSONB NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    schemaEnsured = true;
    return true;
  } catch (err) {
    console.error("[polybot] ensureSchema failed:", err);
    return false;
  }
}

const DEFAULT_KEY = "default";

export interface PersistenceStatus {
  available: boolean;
  reason?: string;
}

export function getPersistenceStatus(): PersistenceStatus {
  if (!DATABASE_URL) {
    return {
      available: false,
      reason:
        "No database connection. Connect a Postgres database in the Vercel dashboard (Storage → Create → Neon Postgres) to enable cross-session persistence.",
    };
  }
  return { available: true };
}

export async function loadBasketFromDb(): Promise<Basket | null> {
  try {
    const sql = await getSql();
    if (!sql) return null;
    if (!(await ensureSchema())) return null;
    const rows = (await sql`
      SELECT data FROM baskets WHERE id = ${DEFAULT_KEY} LIMIT 1
    `) as Array<{ data: Basket }>;
    return rows[0]?.data ?? null;
  } catch (err) {
    console.error("[polybot] loadBasketFromDb failed:", err);
    return null;
  }
}

export async function saveBasketToDb(basket: Basket | null): Promise<boolean> {
  try {
    const sql = await getSql();
    if (!sql) return false;
    if (!(await ensureSchema())) return false;
    if (basket === null) {
      await sql`DELETE FROM baskets WHERE id = ${DEFAULT_KEY}`;
    } else {
      await sql`
        INSERT INTO baskets (id, data, updated_at)
        VALUES (${DEFAULT_KEY}, ${JSON.stringify(basket)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `;
    }
    return true;
  } catch (err) {
    console.error("[polybot] saveBasketToDb failed:", err);
    return false;
  }
}
