// LP program builder + solver wrapper.
//
// Encoding:
//   variables:
//     t_pos, t_neg ≥ 0   →   effective t = t_pos − t_neg (free var via the
//                            standard non-negative split, since the solver
//                            requires non-negative variables).
//     x_<i>_<σ>_<k> ≥ 0  →   dollars filled on leg i, side σ, level k.
//   objective:
//     maximise (t_pos − t_neg)
//   constraints:
//     budget:   Σ x ≤ B
//     scenario_<key>:  Σ x · ((match ? 1/p : 0) − 1) − (t_pos − t_neg) ≥ 0
//     cap_<i>_<σ>_<k>: x_<i>_<σ>_<k> ≤ ladder level depth in $
//     legcap_<i>:      Σ_{σ,k} x_<i>_<σ>_<k> ≤ user-set per-leg cap (optional)

import type { Basket, Scenario } from "./types";
import type { LadderSlice } from "./ladder";

export interface LpModel {
  optimize: string;
  opType: "max" | "min";
  constraints: Record<string, { min?: number; max?: number; equal?: number }>;
  variables: Record<string, Record<string, number>>;
}

export interface LpSolverRaw {
  feasible: boolean;
  result: number;
  bounded?: boolean;
  [varName: string]: unknown;
}

export interface LpRawSolution {
  feasible: boolean;
  worstCaseProfit: number; // value of effective t
  varValues: Record<string, number>;
}

export const LP_OBJECTIVE = "obj";
export const LP_T_POS = "t_pos";
export const LP_T_NEG = "t_neg";

export function levelVarName(legIndex: number, side: "YES" | "NO", levelIdx: number): string {
  return `x_${legIndex}_${side === "YES" ? "Y" : "N"}_${levelIdx}`;
}

export function scenarioConstraintName(scenarioKey: string): string {
  return `s_${scenarioKey}`;
}

export function buildProgram(
  basket: Basket,
  scenarios: Scenario[],
  ladders: LadderSlice[],
): LpModel {
  const constraints: LpModel["constraints"] = {
    budget: { max: basket.budget },
  };
  const variables: LpModel["variables"] = {
    [LP_T_POS]: { [LP_OBJECTIVE]: 1 },
    [LP_T_NEG]: { [LP_OBJECTIVE]: -1 },
  };

  // Per-scenario constraint scaffold: we'll fill in coefficients per variable.
  for (const s of scenarios) {
    constraints[scenarioConstraintName(s.key)] = { min: 0 };
    // t_pos contributes -1, t_neg contributes +1.
    variables[LP_T_POS][scenarioConstraintName(s.key)] = -1;
    variables[LP_T_NEG][scenarioConstraintName(s.key)] = 1;
  }

  // Per-leg user caps (optional).
  const perLegCaps: Record<number, string> = {};
  basket.legs.forEach((leg, idx) => {
    if (typeof leg.cap === "number" && leg.cap > 0) {
      const name = `legcap_${idx}`;
      constraints[name] = { max: leg.cap };
      perLegCaps[idx] = name;
    }
  });

  // Add an x_<i>_<σ>_<k> variable per ladder level.
  for (const slice of ladders) {
    const sideShort = slice.side;
    slice.levels.forEach((lvl, levelIdx) => {
      const name = levelVarName(slice.legIndex, sideShort, levelIdx);
      const coefs: Record<string, number> = {
        [LP_OBJECTIVE]: 0,
        budget: 1,
      };

      // Per-level liquidity cap.
      const capName = `cap_${slice.legIndex}_${sideShort === "YES" ? "Y" : "N"}_${levelIdx}`;
      constraints[capName] = { max: lvl.dollarCap };
      coefs[capName] = 1;

      // Per-leg user cap, if any.
      const legCap = perLegCaps[slice.legIndex];
      if (legCap) coefs[legCap] = 1;

      // Scenario coefficients: payout-share if this leg/side matches s,
      // minus 1 (cost) regardless.
      for (const s of scenarios) {
        const isYes = s.yes[slice.legIndex];
        const matches = (sideShort === "YES" && isYes) || (sideShort === "NO" && !isYes);
        const sharePer$ = matches ? 1 / lvl.price : 0;
        coefs[scenarioConstraintName(s.key)] = sharePer$ - 1;
      }

      variables[name] = coefs;
    });
  }

  return {
    optimize: LP_OBJECTIVE,
    opType: "max",
    constraints,
    variables,
  };
}

// Run the LP. Pulled out so we can swap solver implementations later.
export async function solveProgram(model: LpModel): Promise<LpRawSolution> {
  // Lazy-load the solver so it doesn't bloat any client bundle.
  const mod = await import("javascript-lp-solver");
  const solver = (mod.default ?? mod) as { Solve: (m: LpModel) => LpSolverRaw };
  const raw = solver.Solve(model);
  const feasible = raw.feasible !== false;

  const varValues: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "feasible" || k === "result" || k === "bounded") continue;
    if (typeof v === "number") varValues[k] = v;
  }
  // The solver's `result` is the objective value (t_pos − t_neg).
  const worstCaseProfit = feasible ? Number(raw.result ?? 0) : Number.NaN;
  return { feasible, worstCaseProfit, varValues };
}
