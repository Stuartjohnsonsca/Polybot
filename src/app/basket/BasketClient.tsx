"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearBasket,
  getBasketSnapshot,
  hydrateFromServer,
  removeLegFromBasket,
  setBudget,
  setScenarioProbabilities,
  setThesisPredicates,
  useBasket,
} from "@/lib/basket/store";
import { enumerateScenarios, estimateScenarioCount, MAX_SCENARIOS } from "@/lib/optimiser/thesis";
import type {
  Basket,
  OptimiseResult,
  ThesisPredicate,
} from "@/lib/optimiser/types";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { runOptimisation } from "./actions";

const AUTO_SOLVE_DEBOUNCE_MS = 1500;

interface BasketClientProps {
  initial: Basket | null;
  persistenceAvailable: boolean;
  persistenceMessage?: string;
}

export default function BasketClient({
  initial,
  persistenceAvailable,
  persistenceMessage,
}: BasketClientProps) {
  // Hydrate the local store with the server-loaded basket on first render.
  // This runs on the client only — `hydrateFromServer` is a no-op if local
  // state already exists, so optimistic updates aren't clobbered.
  useEffect(() => {
    hydrateFromServer(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const basket = useBasket();
  const [solving, setSolving] = useState(false);
  const [result, setResult] = useState<OptimiseResult | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [lastSolvedAt, setLastSolvedAt] = useState<number | null>(null);

  const scenarios = useMemo(() => {
    if (!basket || basket.legs.length === 0) return [];
    try {
      return enumerateScenarios(basket.legs.length, basket.thesis);
    } catch {
      return [];
    }
  }, [basket]);

  const probSum = useMemo(() => {
    if (!basket?.thesis.scenarioProbabilities) return 0;
    return Object.values(basket.thesis.scenarioProbabilities).reduce(
      (s, v) => s + (Number.isFinite(v) ? v : 0),
      0,
    );
  }, [basket]);

  // Auto-solve: every basket change schedules a solve after a debounce.
  // The latest snapshot wins; in-flight solves are dropped if a newer
  // change arrives. We key the cache by a stable digest so identical
  // basket states don't re-trigger.
  const basketDigest = useMemo(() => digestBasket(basket), [basket]);
  const inFlightToken = useRef(0);
  const lastSolvedDigest = useRef<string | null>(null);

  useEffect(() => {
    if (!basket || basket.legs.length === 0) {
      setResult(null);
      setSolveError(null);
      lastSolvedDigest.current = null;
      return;
    }
    if (basketDigest === lastSolvedDigest.current) return;

    const timer = setTimeout(() => {
      const snap = getBasketSnapshot();
      if (!snap || snap.legs.length === 0) return;
      const digestAtFire = digestBasket(snap);
      if (digestAtFire === lastSolvedDigest.current) return;

      const token = ++inFlightToken.current;
      setSolving(true);
      setSolveError(null);

      runOptimisation(snap)
        .then((r) => {
          // Drop late results — a newer change has already been queued.
          if (token !== inFlightToken.current) return;
          setResult(r);
          setLastSolvedAt(Date.now());
          lastSolvedDigest.current = digestAtFire;
        })
        .catch((e) => {
          if (token !== inFlightToken.current) return;
          setSolveError(e instanceof Error ? e.message : "Unknown solver error");
        })
        .finally(() => {
          if (token !== inFlightToken.current) return;
          setSolving(false);
        });
    }, AUTO_SOLVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [basket, basketDigest]);

  const forceResolve = () => {
    lastSolvedDigest.current = null;
    // Trigger a fresh effect run by mutating the basket reference would be
    // intrusive; instead just call the action directly with a new token.
    const snap = getBasketSnapshot();
    if (!snap || snap.legs.length === 0) return;
    const token = ++inFlightToken.current;
    setSolving(true);
    setSolveError(null);
    runOptimisation(snap)
      .then((r) => {
        if (token !== inFlightToken.current) return;
        setResult(r);
        setLastSolvedAt(Date.now());
        lastSolvedDigest.current = digestBasket(snap);
      })
      .catch((e) => {
        if (token !== inFlightToken.current) return;
        setSolveError(e instanceof Error ? e.message : "Unknown solver error");
      })
      .finally(() => {
        if (token !== inFlightToken.current) return;
        setSolving(false);
      });
  };

  const persistenceBanner = !persistenceAvailable && (
    <div className="rounded border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-300">
      <strong>Persistence not configured.</strong>{" "}
      {persistenceMessage ??
        "Connect a Postgres database in your Vercel dashboard to enable cross-session persistence. The basket is currently saved only in this browser."}
    </div>
  );

  if (!basket || basket.legs.length === 0) {
    return (
      <div className="space-y-4">
        {persistenceBanner}
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {persistenceBanner}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Basket</h1>
          <p className="mt-1 text-sm text-muted">
            Section: <span className="text-text">{basket.section}</span>
            {" · "}
            {basket.legs.length} leg{basket.legs.length === 1 ? "" : "s"}
            {" · "}
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear the basket?")) {
                  clearBasket();
                  setResult(null);
                  lastSolvedDigest.current = null;
                }
              }}
              className="text-bad hover:underline"
            >
              clear basket
            </button>
          </p>
        </div>
        <SolveStatus
          solving={solving}
          lastSolvedAt={lastSolvedAt}
          onForceResolve={forceResolve}
        />
      </header>

      {solveError && (
        <div className="rounded border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {solveError}
        </div>
      )}

      <LegsPanel basket={basket} />
      <BudgetPanel budget={basket.budget} />
      <ThesisPanel
        predicates={basket.thesis.predicates}
        legCount={basket.legs.length}
        legNames={basket.legs.map((l) => l.question)}
        scenarioEstimate={estimateScenarioCount(basket.legs.length, basket.thesis)}
      />
      <ScenarioProbsPanel
        scenarios={scenarios}
        legNames={basket.legs.map((l) => l.question)}
        probabilities={basket.thesis.scenarioProbabilities}
        sum={probSum}
      />

      {result && <ResultPanel result={result} legNames={basket.legs.map((l) => l.question)} />}
    </div>
  );
}

// Stable string fingerprint of the bits of basket state that affect the
// LP solution. Probabilities don't change the solve (they only feed the
// expected-profit calc), so we include them too — easier than re-running
// the result mapper.
function digestBasket(b: Basket | null): string {
  if (!b) return "";
  return JSON.stringify({
    s: b.section,
    bg: b.budget,
    legs: b.legs.map((l) => [l.marketId, l.preferredSide, l.cap ?? null]),
    p: b.thesis.predicates,
    pr: b.thesis.scenarioProbabilities ?? null,
  });
}

function SolveStatus({
  solving,
  lastSolvedAt,
  onForceResolve,
}: {
  solving: boolean;
  lastSolvedAt: number | null;
  onForceResolve: () => void;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      {solving ? (
        <span className="flex items-center gap-2 text-accent">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
          Solving…
        </span>
      ) : lastSolvedAt ? (
        <span className="text-muted">
          solved {formatRelative(lastSolvedAt)}
        </span>
      ) : (
        <span className="text-muted">awaiting changes…</span>
      )}
      <button
        type="button"
        onClick={onForceResolve}
        disabled={solving}
        className="rounded border border-border bg-panel2 px-3 py-1 hover:border-accent hover:text-accent disabled:opacity-50"
        title="Re-fetch fresh orderbook ladders and re-solve from scratch"
      >
        Re-solve
      </button>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-border bg-panel p-8 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Basket is empty</h1>
      <p className="mt-2 text-sm text-muted">
        Add legs from the listing pages or any event detail. Once you have at
        least two legs and a thesis, the LP optimiser will solve for stake
        weights that maximise your worst-case profit across the scenarios you
        consider possible — choosing YES vs NO for each leg automatically
        based on the maths.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link
          href="/politics"
          className="rounded-md border border-border bg-panel2 px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          Browse Politics
        </Link>
        <Link
          href="/forex"
          className="rounded-md border border-border bg-panel2 px-4 py-2 text-sm hover:border-accent hover:text-accent"
        >
          Browse Forex
        </Link>
      </div>
    </div>
  );
}

function LegsPanel({ basket }: { basket: Basket }) {
  return (
    <section className="rounded-lg border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
        <span className="font-medium">Legs</span>
        <span
          className="text-xs text-muted"
          title="The optimiser picks YES or NO per leg based on the maths — no manual side selection."
        >
          side: auto
        </span>
      </div>
      <ul className="divide-y divide-border">
        {basket.legs.map((leg, idx) => (
          <li
            key={leg.marketId}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm"
          >
            <span className="font-mono text-xs text-muted">#{idx + 1}</span>
            <span className="truncate" title={leg.question}>
              {leg.question}
            </span>
            <span className="font-mono text-xs text-muted">{fmtPrice(leg.yesPrice)}</span>
            <button
              type="button"
              onClick={() => removeLegFromBasket(leg.marketId)}
              className="text-xs text-muted hover:text-bad"
              title="Remove leg"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BudgetPanel({ budget }: { budget: number }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <label className="block text-sm font-medium">Budget (USDC)</label>
      <input
        type="number"
        min={0}
        value={budget}
        onChange={(e) => setBudget(Number(e.target.value))}
        className="mt-2 w-32 rounded border border-border bg-panel2 px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
      />
      <p className="mt-2 text-xs text-muted">
        Maximum total dollars staked across all legs and price levels.
      </p>
    </section>
  );
}

function ThesisPanel({
  predicates,
  legCount,
  legNames,
  scenarioEstimate,
}: {
  predicates: ThesisPredicate[];
  legCount: number;
  legNames: string[];
  scenarioEstimate: number;
}) {
  const add = (p: ThesisPredicate) => setThesisPredicates([...predicates, p]);
  const remove = (i: number) =>
    setThesisPredicates(predicates.filter((_, idx) => idx !== i));

  const overCap = scenarioEstimate > MAX_SCENARIOS;
  const scenarioLabel =
    scenarioEstimate === Infinity
      ? `2^${legCount} (unbounded — needs a count predicate)`
      : scenarioEstimate.toLocaleString();

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Thesis</h2>
        <span className="text-xs">
          <span className="text-muted">
            {predicates.length} predicate{predicates.length === 1 ? "" : "s"} ·{" "}
          </span>
          <span
            className={overCap || scenarioEstimate === Infinity ? "text-bad" : "text-muted"}
            title={`Scenario count drives LP size. Hard cap: ${MAX_SCENARIOS.toLocaleString()}.`}
          >
            ~{scenarioLabel} scenarios
          </span>
        </span>
      </div>

      {predicates.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          No predicates — every joint outcome is considered possible. Add at
          least one to define which scenarios the optimiser should cover.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {predicates.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded bg-panel2 px-3 py-1.5 text-xs"
            >
              <span>
                {p.kind === "atMostK" && `at most ${p.k} of these resolve YES`}
                {p.kind === "exactlyK" && `exactly ${p.k} of these resolve YES`}
                {p.kind === "implies" &&
                  `if "${truncate(legNames[p.from] ?? `#${p.from}`, 32)}" YES → "${truncate(legNames[p.to] ?? `#${p.to}`, 32)}" YES`}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted hover:text-bad"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <ThesisAddRow legCount={legCount} legNames={legNames} onAdd={add} />
    </section>
  );
}

function ThesisAddRow({
  legCount,
  legNames,
  onAdd,
}: {
  legCount: number;
  legNames: string[];
  onAdd: (p: ThesisPredicate) => void;
}) {
  const [kind, setKind] = useState<"atMostK" | "exactlyK" | "implies">("atMostK");
  const [k, setK] = useState(1);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(legCount > 1 ? 1 : 0);

  const submit = () => {
    if (kind === "implies") {
      if (from === to) return;
      onAdd({ kind, from, to });
    } else {
      onAdd({ kind, k });
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className="rounded border border-border bg-panel2 px-2 py-1"
      >
        <option value="atMostK">at most K YES</option>
        <option value="exactlyK">exactly K YES</option>
        <option value="implies">if A then B</option>
      </select>

      {kind !== "implies" ? (
        <>
          <span className="text-muted">K =</span>
          <input
            type="number"
            min={0}
            max={legCount}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-14 rounded border border-border bg-panel2 px-2 py-1 font-mono"
          />
        </>
      ) : (
        <>
          <select
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
            className="max-w-[160px] truncate rounded border border-border bg-panel2 px-2 py-1"
          >
            {legNames.map((n, i) => (
              <option key={i} value={i}>
                {i + 1}. {truncate(n, 32)}
              </option>
            ))}
          </select>
          <span className="text-muted">⇒</span>
          <select
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            className="max-w-[160px] truncate rounded border border-border bg-panel2 px-2 py-1"
          >
            {legNames.map((n, i) => (
              <option key={i} value={i}>
                {i + 1}. {truncate(n, 32)}
              </option>
            ))}
          </select>
        </>
      )}

      <button
        type="button"
        onClick={submit}
        className="rounded border border-border bg-panel2 px-3 py-1 hover:border-accent hover:text-accent"
      >
        + add
      </button>
    </div>
  );
}

function ScenarioProbsPanel({
  scenarios,
  legNames,
  probabilities,
  sum,
}: {
  scenarios: { yes: boolean[]; key: string }[];
  legNames: string[];
  probabilities: Record<string, number> | undefined;
  sum: number;
}) {
  if (scenarios.length === 0) return null;

  const tooMany = scenarios.length > 64;

  const update = (key: string, val: number) => {
    const next = { ...(probabilities ?? {}) };
    if (val > 0) next[key] = val;
    else delete next[key];
    setScenarioProbabilities(Object.keys(next).length === 0 ? undefined : next);
  };

  const distributeUniform = () => {
    const each = 1 / scenarios.length;
    const next: Record<string, number> = {};
    for (const s of scenarios) next[s.key] = each;
    setScenarioProbabilities(next);
  };

  const clear = () => setScenarioProbabilities(undefined);

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">
            Scenario probabilities <span className="text-muted">(optional)</span>
          </h2>
          <p className="text-xs text-muted">
            {scenarios.length} thesis-allowed scenario{scenarios.length === 1 ? "" : "s"} ·
            sum {(sum * 100).toFixed(1)}%
            {sum > 0 && sum < 0.99 && (
              <>
                {" "}
                · uncovered tail{" "}
                <span className="text-bad">{((1 - sum) * 100).toFixed(1)}%</span>
              </>
            )}
            {sum > 1.01 && <span className="ml-1 text-bad">— sum exceeds 100%</span>}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={distributeUniform}
            className="rounded border border-border bg-panel2 px-2 py-1 hover:border-accent"
          >
            uniform
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded border border-border bg-panel2 px-2 py-1 hover:border-accent"
          >
            clear
          </button>
        </div>
      </div>

      {tooMany ? (
        <p className="mt-3 text-xs text-muted">
          {scenarios.length} scenarios — too many to display individually.
          Tighten the thesis to enable per-scenario probability input.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {scenarios.map((s) => {
            const desc = s.yes
              .map((y, i) => `${truncate(legNames[i] ?? `#${i + 1}`, 18)}=${y ? "Y" : "N"}`)
              .join(" · ");
            const v = probabilities?.[s.key] ?? 0;
            return (
              <li
                key={s.key}
                className="flex items-center justify-between gap-3 rounded bg-panel2 px-3 py-1 text-xs"
              >
                <span className="truncate font-mono text-muted" title={desc}>
                  {desc}
                </span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={v}
                  onChange={(e) => update(s.key, Number(e.target.value))}
                  className="w-20 rounded border border-border bg-panel px-2 py-0.5 text-right font-mono"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ResultPanel({
  result,
  legNames,
}: {
  result: OptimiseResult;
  legNames: string[];
}) {
  const hasTrades = result.legStakes.length > 0;
  return (
    <section className="space-y-4">
      {/* Proposed trades — surfaced FIRST so the directional bets are
          impossible to miss. Empty-state explains *why* there are none. */}
      <div className="rounded-lg border border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">
            Proposed trades{" "}
            <span className="text-muted">
              — chosen by the optimiser to hedge your thesis
            </span>
          </h2>
          {hasTrades && (
            <span className="text-xs text-muted">
              {result.legStakes.length} leg{result.legStakes.length === 1 ? "" : "s"} ·{" "}
              {fmtUsd(result.totalStaked, { compact: false })} total
            </span>
          )}
        </div>
        {hasTrades ? (
          <ul className="divide-y divide-border">
            {result.legStakes.map((s) => (
              <li
                key={`${s.marketId}-${s.side}`}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm"
              >
                <span
                  className={`rounded px-3 py-1 text-xs font-bold tracking-wide ${
                    s.side === "YES"
                      ? "bg-good/20 text-good"
                      : "bg-accent2/20 text-accent2"
                  }`}
                  title={
                    s.side === "YES"
                      ? "Buy YES shares — wins $1 per share if this market resolves YES"
                      : "Buy NO shares — wins $1 per share if this market resolves NO"
                  }
                >
                  BUY {s.side}
                </span>
                <span className="truncate" title={s.question}>
                  {s.question}
                </span>
                <span className="font-mono text-xs text-muted">
                  @ {fmtPrice(s.averagePrice)} · {s.totalShares.toFixed(0)} shares
                </span>
                <span className="w-24 text-right font-mono text-sm">
                  {fmtUsd(s.totalDollars, { compact: false })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-5 text-sm text-muted">
            <p>
              <strong className="text-text">No trades proposed.</strong>{" "}
              The optimiser couldn&apos;t find a hedged combination that
              improves on doing nothing under the current basket and thesis.
              {result.warnings.length > 0
                ? " See the diagnostics below for why."
                : " Try tightening the thesis (lower K), adjusting the legs, or increasing the budget."}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-panel p-4">
        <h2 className="text-sm font-medium">Solve result</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Feasible" value={result.feasible ? "yes" : "no"} tone={result.feasible ? "good" : "bad"} />
          <Stat label="Total staked" value={fmtUsd(result.totalStaked, { compact: false })} />
          <Stat
            label="Worst-case profit"
            value={fmtUsd(result.worstCaseProfit, { compact: false })}
            tone={result.worstCaseProfit > 0 ? "good" : result.worstCaseProfit < 0 ? "bad" : undefined}
          />
          <Stat
            label="Expected profit"
            value={
              result.expectedProfit !== null
                ? fmtUsd(result.expectedProfit, { compact: false })
                : "—"
            }
            tone={
              result.expectedProfit === null
                ? undefined
                : result.expectedProfit > 0
                  ? "good"
                  : "bad"
            }
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Coverage: {result.coverage.scenariosCovered} of{" "}
          {result.coverage.scenariosTotal} possible worlds
          {result.coverage.probabilityMassCovered !== null && (
            <>
              {" "}
              · {(result.coverage.probabilityMassCovered * 100).toFixed(1)}% of
              your subjective probability mass
            </>
          )}
        </p>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-border bg-panel p-4">
          <h3 className="text-sm font-medium">Diagnostics</h3>
          <ul className="mt-2 space-y-1 text-xs">
            {result.warnings.map((w, i) => (
              <li
                key={i}
                className={
                  w.level === "warn"
                    ? "rounded bg-bad/10 px-3 py-1.5 text-bad"
                    : "rounded bg-panel2 px-3 py-1.5 text-muted"
                }
              >
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.scenarios.length > 0 && (
        <div className="rounded-lg border border-border bg-panel">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">
            Scenario payouts (worst → best)
          </div>
          <ul className="divide-y divide-border">
            {result.scenarios.map((sp) => {
              const desc = sp.yes
                .map((y, i) => `${truncate(legNames[i] ?? `#${i + 1}`, 18)}=${y ? "Y" : "N"}`)
                .join(" · ");
              return (
                <li
                  key={sp.key}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2 text-xs"
                >
                  <span className="truncate font-mono text-muted" title={desc}>
                    {desc}
                  </span>
                  <span className="font-mono text-muted">
                    {sp.probability !== null
                      ? `p ${(sp.probability * 100).toFixed(1)}%`
                      : ""}
                  </span>
                  <span className="font-mono text-muted">
                    payout {fmtUsd(sp.payout, { compact: true })}
                  </span>
                  <span
                    className={`w-24 text-right font-mono ${
                      sp.profit > 0 ? "text-good" : sp.profit < 0 ? "text-bad" : "text-text"
                    }`}
                  >
                    {sp.profit >= 0 ? "+" : ""}
                    {fmtUsd(sp.profit, { compact: false })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const cls = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-mono text-lg ${cls}`}>{value}</div>
    </div>
  );
}

function truncate(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
