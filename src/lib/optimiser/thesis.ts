import type { Scenario, Thesis, ThesisPredicate } from "./types";

const MAX_LEGS_FOR_ENUMERATION = 14; // 2^14 = 16384 raw scenarios.

// Enumerate all 2^n joint Y/N assignments and keep only those satisfying
// every predicate in the thesis. The result is the scenario set S used in
// the LP's max-min constraints.
export function enumerateScenarios(n: number, thesis: Thesis): Scenario[] {
  if (n <= 0) return [];
  if (n > MAX_LEGS_FOR_ENUMERATION) {
    throw new Error(
      `Too many legs (${n}). The optimiser enumerates 2^n scenarios; cap is ${MAX_LEGS_FOR_ENUMERATION}.`,
    );
  }

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
    if (!satisfies(yes, yesCount, thesis.predicates)) continue;
    out.push({ yes, key: encodeKey(yes) });
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
