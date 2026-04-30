declare module "javascript-lp-solver" {
  interface Model {
    optimize: string;
    opType: "max" | "min";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
  }

  interface Solution {
    feasible: boolean;
    result: number;
    bounded?: boolean;
    [varName: string]: unknown;
  }

  const solver: {
    Solve: (model: Model) => Solution;
  };

  export default solver;
}
