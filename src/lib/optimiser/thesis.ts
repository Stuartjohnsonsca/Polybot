import type { Scenario, Thesis, ThesisPredicate } from "./types";

// Hard caps to keep the LP tractable.
//   - Full 2^n enumeration (used when no count-bounded predicate exists)
//     stays at 14 → 16384 raw scenarios.
//   - Smart enumeration via C(n,k) supports much larger n as long as the
//     thesis bounds the YES-count, but we still cap the final scenario
//     set at MAX_SCENARIOS to keep the LP from exploding.
//
// 500k scenarios with the GLPK solver path solves in ~30–60s wall on
// Vercel Hobby (1024MB function memory). Push the cap higher if/when we
// move to constraint-generation rather than full enumeration.
const MAX_LEGS_FOR_FULL_ENUMERATION = 14;
export const MAX_SCENARIOS = 500_000;

export class ThesisEnumerationError extends Error {
  code: "TOO_MANY_LEGS_UNBOUNDED" | "TOO_MANY_SCENARIOS";
  constructor(
    code: "TOO_MANY_LEGS_UNBOUNDED" | "TOO_MANY_SCENARIOS",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "ThesisEnumerationError";
  }
}

// Derive the tightest YES-count window the thesis allows. Predicates that
// don't bound the count (implies) are ignored here and applied as a filter
// in the enumerator below.
export function countBound(
  n: number,
  predicates: ThesisPredicate[],
): { min: number; max: number } {
  let min = 0;
  let max = n;
  for (const p of predicates) {
    if (p.kind === "atMostK") max = Math.min(max, p.k);
    else if (p.kind === "exactlyK") {
      min = Math.max(min, p.k);
      max = Math.min(max, p.k);
    }
  }
  return { min, max };
}

// Cheap upper-bound estimate of the scenario count for the given thesis,
// without actually enumerating. Used in the UI so the user can see how
// their predicate choices affect tractability before hitting the solver.
// Returns Infinity for unsupported configurations (n > 14 with no count
// predicate); implies predicates are NOT factored in (overestimates).
export function estimateScenarioCount(n: number, thesis: Thesis): number {
  if (n <= 0) return 0;
  const { min, max } = countBound(n, thesis.predicates);
  if (min > max) return 0;
  if (min === 0 && max === n) {
    return n > MAX_LEGS_FOR_FULL_ENUMERATION ? Infinity : 1 << n;
  }
  let total = 0;
  for (let k = min; k <= max; k++) total += binomial(n, k);
  return total;
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// In-place lexicographic generator over k-element subsets of {0..n-1}.
function* combinationsOfSize(n: number, k: number): Generator<number[]> {
  if (k < 0 || k > n) return;
  if (k === 0) {
    yield [];
    return;
  }
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices;
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

// Enumerate all 2^n joint Y/N assignments and keep only those satisfying
// every predicate in the thesis. Throws ThesisEnumerationError when the
// problem is too large for the cheap-and-cheerful path.
//
// When the thesis bounds the YES-count via atMostK or exactlyK we take
// the smart path: generate only subsets of the allowed sizes and apply
// the remaining (implies) predicates as a filter. This makes large
// baskets (20–30 legs) tractable as long as the thesis is tight enough.
export function enumerateScenarios(n: number, thesis: Thesis): Scenario[] {
  if (n <= 0) return [];

  const { min, max } = countBound(n, thesis.predicates);
  if (min > max) return [];

  const isUnbounded = min === 0 && max === n;
  if (isUnbounded) {
    if (n > MAX_LEGS_FOR_FULL_ENUMERATION) {
      throw new ThesisEnumerationError(
        "TOO_MANY_LEGS_UNBOUNDED",
        `Too many legs (${n}) without a count-bounded thesis. Add an "at most K YES" or "exactly K YES" predicate so the optimiser only considers feasible scenarios.`,
      );
    }
    return enumerateFull(n, thesis.predicates);
  }

  return enumerateBounded(n, min, max, thesis.predicates);
}

function enumerateFull(n: number, predicates: ThesisPredicate[]): Scenario[] {
  const total = 1 << n;
  const out: Scenario[] = [];
  for (let mask = 0; mask < total; mask++) {
    const yes = new Array<boolean>(n);
    let yesCount = 0;
    for (let i = 0; i < n; i++) {
      const bit = (mask >> i) & 1;
      yes[i] = bit === 1;
      if (bit === 1) yesCount++;
    }
    if (!satisfies(yes, yesCount, predicates)) continue;
    out.push({ yes, key: encodeKey(yes) });
  }
  return out;
}

function enumerateBounded(
  n: number,
  min: number,
  max: number,
  predicates: ThesisPredicate[],
): Scenario[] {
  const impliesPreds = predicates.filter(
    (p): p is Extract<ThesisPredicate, { kind: "implies" }> => p.kind === "implies",
  );
  const out: Scenario[] = [];
  for (let k = min; k <= max; k++) {
    for (const indices of combinationsOfSize(n, k)) {
      if (out.length >= MAX_SCENARIOS) {
        throw new ThesisEnumerationError(
          "TOO_MANY_SCENARIOS",
          `Thesis admits too many scenarios (over ${MAX_SCENARIOS.toLocaleString()}). Tighten the predicates — e.g. lower K in "at most K YES" — so the optimiser can solve in reasonable time.`,
        );
      }
      const yes = new Array<boolean>(n).fill(false);
      for (const i of indices) yes[i] = true;
      let ok = true;
      for (const p of impliesPreds) {
        if (yes[p.from] && !yes[p.to]) {
          ok = false;
          break;
        }
      }
      if (ok) out.push({ yes, key: encodeKey(yes) });
    }
  }
  return out;
}

function satisfies(
  yes: boolean[],
  yesCount: number,
  predicates: ThesisPredicate[],
): boolean {
  for (const p of predicates) {
    switch (p.kind) {
      case "atMostK":
        if (yesCount > p.k) return false;
        break;
      case "exactlyK":
        if (yesCount !== p.k) return false;
        break;
      case "implies":
        if (yes[p.from] && !yes[p.to]) return false;
        break;
    }
  }
  return true;
}

export function encodeKey(yes: boolean[]): string {
  let out = "";
  for (const b of yes) out += b ? "1" : "0";
  return out;
}

export function describePredicate(p: ThesisPredicate, legNames: string[]): string {
  switch (p.kind) {
    case "atMostK":
      return `at most ${p.k} of these resolve YES`;
    case "exactlyK":
      return `exactly ${p.k} of these resolve YES`;
    case "implies":
      return `if "${legNames[p.from] ?? `#${p.from}`}" resolves YES, then "${legNames[p.to] ?? `#${p.to}`}" must too`;
  }
}
