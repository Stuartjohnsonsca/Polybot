// GLPK (WASM) solver adapter. Used when the LP is too large for the pure-JS
// simplex in javascript-lp-solver — typical break point is around 2k
// scenario constraints, beyond which the JS path is too slow but GLPK
// (with sparse matrices and revised simplex) handles it in seconds.

import type { LP } from "glpk.js";
import type { LpModel, LpRawSolution } from "./lp";
import { LP_T_POS, LP_T_NEG } from "./lp";

let glpkPromise: Promise<unknown> | null = null;

interface Glpk {
  GLP_MAX: number;
  GLP_MIN: number;
  GLP_FR: number;
  GLP_LO: number;
  GLP_UP: number;
  GLP_DB: number;
  GLP_FX: number;
  GLP_OPT: number;
  GLP_FEAS: number;
  GLP_MSG_OFF: number;
  GLP_MSG_ERR: number;
  solve: (
    lp: LP,
    options?: number | { msglev?: number; tmlim?: number; presol?: boolean },
  ) => Promise<{
    name: string;
    time: number;
    result: { status: number; z: number; vars: Record<string, number> };
  }>;
}

async function loadGlpk(): Promise<Glpk> {
  if (!glpkPromise) {
    glpkPromise = import("glpk.js").then((mod) => mod.default());
  }
  return glpkPromise as Promise<Glpk>;
}

export async function solveWithGlpk(model: LpModel): Promise<LpRawSolution> {
  const glpk = await loadGlpk();

  const variableNames = Object.keys(model.variables);
  const constraintNames = Object.keys(model.constraints);

  // Objective row: coefficient per variable. We always optimise on the
  // synthetic LP_OBJECTIVE column ("obj") — t_pos has coef +1, t_neg has
  // coef -1, all others have coef 0.
  const objectiveVars = variableNames
    .map((name) => {
      const coef = model.variables[name]?.[model.optimize] ?? 0;
      return { name, coef };
    })
    .filter((v) => v.coef !== 0);

  // Sparse column-by-column → sparse row-by-row inversion.
  // For each constraint, walk all variables and pick the ones with a non-zero
  // coefficient on that constraint.
  const subjectTo = constraintNames.map((cname) => {
    const c = model.constraints[cname];
    const vars: { name: string; coef: number }[] = [];
    for (const vname of variableNames) {
      const coef = model.variables[vname]?.[cname];
      if (coef !== undefined && coef !== 0) vars.push({ name: vname, coef });
    }
    let bnds: { type: number; lb: number; ub: number };
    if (c.equal !== undefined) {
      bnds = { type: glpk.GLP_FX, lb: c.equal, ub: c.equal };
    } else if (c.min !== undefined && c.max !== undefined) {
      bnds = { type: glpk.GLP_DB, lb: c.min, ub: c.max };
    } else if (c.min !== undefined) {
      bnds = { type: glpk.GLP_LO, lb: c.min, ub: 0 };
    } else if (c.max !== undefined) {
      bnds = { type: glpk.GLP_UP, lb: 0, ub: c.max };
    } else {
      bnds = { type: glpk.GLP_FR, lb: 0, ub: 0 };
    }
    return { name: cname, vars, bnds };
  });

  const lp: LP = {
    name: "polybot",
    objective: {
      direction: model.opType === "max" ? glpk.GLP_MAX : glpk.GLP_MIN,
      name: model.optimize,
      vars: objectiveVars,
    },
    subjectTo,
  };

  // Default variable lower bound is 0 in GLPK, which matches every
  // x_*_*_* / t_pos / t_neg in our program.
  const result = await glpk.solve(lp, {
    msglev: glpk.GLP_MSG_OFF,
    presol: true,
  });

  const status = result.result.status;
  const feasible = status === glpk.GLP_OPT || status === glpk.GLP_FEAS;

  // The objective is the value of (t_pos − t_neg) which is exactly what
  // we report as worst-case profit. Compute it from the variable values
  // rather than result.z — `z` includes any objective shift the solver
  // applies internally.
  const tPos = result.result.vars[LP_T_POS] ?? 0;
  const tNeg = result.result.vars[LP_T_NEG] ?? 0;
  const worstCaseProfit = feasible ? tPos - tNeg : Number.NaN;

  return {
    feasible,
    worstCaseProfit,
    varValues: result.result.vars ?? {},
  };
}
