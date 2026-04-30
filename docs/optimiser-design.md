# Hedge basket optimiser — design

## Goal

Given a set of Polymarket markets `M = {m₁, …, mₙ}` and a **thesis** that
restricts the joint outcomes considered possible, solve for stake weights
that **maximise the worst-case profit across the thesis-allowed scenarios**,
respecting the actual orderbook liquidity available on each leg.

The user's worked example: pick three markets covering a UK PM transition
question, declare *"at most one PM change by 2027"*, and have the optimiser
return either a profitable basket or the smallest possible loss across the
covered space — and quantify the residual probability the thesis didn't
cover (e.g. Andy Burnham emerging).

## Decisions (April 2026 alignment with Stuart)

| Topic | Decision |
|---|---|
| Probability input | Yes — accepted from v1; produces expected profit alongside worst-case |
| Persistence | localStorage only (no DB until persistence becomes a real need) |
| Liquidity model | Full orderbook ladder — piecewise-linear cost per leg in the LP |
| Thesis templates v1 | At-most-K, exactly-K, implication |
| Cross-section baskets | Disallowed — basket is constrained to one section (Politics or Forex) |
| Solver | `javascript-lp-solver` first; swap to `glpk.js` if we hit numerical or degeneracy issues |

## The LP

For each market `i ∈ M` and each side `σ ∈ {Y, N}`, the orderbook ladder
gives `Lᵢ,σ` price levels. Level `k` has price `pᵢ,σ,k` and available depth
`dᵢ,σ,k` (in dollars, since size·price = dollar capacity at that level).

**Variables:**
- `xᵢ,σ,k ≥ 0` — dollars filled on market `i`, side `σ`, at price level `k`
- `t` — worst-case profit floor (objective)

**Per-leg derived quantities:**
- Total dollars on leg `(i, σ)`: `Xᵢ,σ = Σₖ xᵢ,σ,k`
- Total shares on leg `(i, σ)`: `Sᵢ,σ = Σₖ xᵢ,σ,k / pᵢ,σ,k`

**Scenario set `S`:** every joint Y/N assignment over `M` that the thesis
allows. For each market `i` in scenario `s`, let `eᵢ(s) ∈ {0, 1}` be `1` if
`s` says YES.

**Program:**

```
maximise   t

subject to (for each s ∈ S):
   Σᵢ [ eᵢ(s) · Sᵢ,Y  +  (1 − eᵢ(s)) · Sᵢ,N ]
   − Σᵢ,σ Xᵢ,σ
   ≥ t

   Σᵢ,σ Xᵢ,σ ≤ B          (budget)
   xᵢ,σ,k ≤ dᵢ,σ,k         (per-level liquidity cap)
   xᵢ,σ,k ≥ 0
```

The piecewise-linear cost is automatic: because each level `k` is a
separate variable bounded by `dᵢ,σ,k` and contributing `1/pᵢ,σ,k` shares
per dollar, the LP will fill cheap levels first when shares are needed —
exactly the convex cost-of-buying-shares-at-the-orderbook function we want.

**Size sanity:** for `n = 6` markets with thesis "at most 2 YES",
`|S| = C(6,0) + C(6,1) + C(6,2) = 22` scenario constraints. With ladders
of ~10 levels per side, we have `2 · 6 · 10 = 120` `x` variables. Trivial.

## Thesis vocabulary v1

Three templates compile down to a scenario set `S ⊆ {Y, N}ⁿ`:

1. **At-most-K** — `|{i : eᵢ(s) = Y}| ≤ K`
2. **Exactly-K** — `|{i : eᵢ(s) = Y}| = K`
3. **Implication** — `eᵢ(s) = Y ⇒ eⱼ(s) = Y` for some pair `(i, j)`

A basket can compose multiple predicates (e.g. *at most 1 YES* AND
*Rayner-PM ⇒ Starmer-ousted*). Internally `S` is the intersection of
predicate-allowed sets.

A "custom scenario picker" (toggle individual rows of `{Y, N}ⁿ`) is a
later addition for power users.

## Per-leg side hint

For each market in the basket the user can pin a **preferred side**
(`Y`, `N`, or `EITHER`). When `EITHER` is selected the LP can stake on
both sides of the same market (rare in practice but the program handles
it without changes). Pinning is enforced by setting opposing-side level
caps to zero.

## Probability input (optional)

For each scenario `s ∈ S` the user may supply a subjective probability
`q(s) ≥ 0` with `Σ q(s) = 1`. We then report:

- **Expected profit** = `Σₛ q(s) · profit(s)`
- **Profit-per-scenario heatmap** sorted by `q(s)`
- **Coverage** = `Σ q(s)` for `s ∈ S` — the user's confidence the thesis
  holds. Residual `1 − coverage` is the bare-tail risk.

Default if user skips: uniform over `S`. Coverage defaults to "you tell us".

## Reporting

After the solve, the UI shows four panels:

| Panel | Contents |
|---|---|
| **Stake table** | Per leg: side, total dollars, total shares, weighted-average fill price, levels touched |
| **Scenario payouts** | Each `s ∈ S`: profit `$`, profit %, sorted worst → best |
| **Coverage** | `|S|` of `2ⁿ` worlds covered; with subjective probs, fraction of mass |
| **Warnings** | Liquidity-clipped legs; legs with zero stake (dominated); thesis with no positive profit; legs whose `resolutionSource` differs from group consensus |

## Architecture

```
src/lib/optimiser/
├─ types.ts        Basket, Thesis, OptimiseResult, Scenario, Ladder
├─ thesis.ts       Predicate types + enumerate(thesis, n) → Scenario[]
├─ ladder.ts       Normalise CLOB orderbook → Ladder (depth in $)
├─ lp.ts           buildProgram(basket, thesis, ladders, budget) → LpModel
│                  solve(LpModel) → LpRawSolution
├─ result.ts       Map LpRawSolution + inputs → OptimiseResult
└─ index.ts        optimiseBasket(...) — public entry

src/lib/polymarket/
└─ clob.ts         fetchOrderbook(tokenId) → RawBook

src/app/basket/
├─ page.tsx        Basket builder + thesis picker + results (client)
└─ actions.ts      "use server" — fetch ladders, solve, return result

URL state         → ?legs=ID:Y,ID:N,…&thesis=atMostK:1&section=politics
                    (shareable, refresh-safe; localStorage mirrors it)
LocalStorage      → keyed list of named saved baskets
```

The basket builder is a client component for interactivity; the **solve**
is a server action so neither the LP solver nor the CLOB-fetching logic
ships to the browser.

## Section restriction

Each market's section (Politics / Forex) is derived from its event tags.
The basket carries a single `section` field; "Add to basket" buttons in
the UI refuse to add a market from the wrong section and surface a clear
error. Switching sections requires explicitly clearing the basket.

## Resolution-criterion warnings

Two markets that look identical can resolve differently. Each leg's
`resolutionSource` (and a hash of the resolution body, when available) is
displayed prominently. If two legs in the same basket have different
sources the UI flags it as a *resolution-divergence* warning — the user
can dismiss it if they've manually verified the legs really do co-resolve.

## Stale-price handling

The basket page caches ladders on the client for `~30s`. The "Solve"
button always re-fetches before running the LP, so the displayed result
is computed against the freshest available book. A future "Execute"
button (out of scope here) would re-fetch and re-solve a third time at
submission.

## What's explicitly out of scope for this milestone

- Order execution (CLOB API write side, Polygon proxy wallet)
- Cross-event grouping via embeddings (separate milestone)
- Postgres / shared baskets / backtesting (separate milestone)
- Auto-suggesting baskets from the catalogue (later — manual selection only for v1)

## Open issues to watch during implementation

- **NegRisk math**: when all selected legs share one negRisk event group,
  Polymarket itself enforces mutual exclusion and has different fee
  semantics. Detect and surface as a separate "trivial Dutch book" path
  rather than running the general LP (cheaper, less prone to numerical
  noise).
- **Tiny price levels**: `pᵢ,σ,k = 0.001` produces 1000× share multipliers
  and can stress the simplex. Cap the share-multiplier or switch to
  `glpk.js` if we see it bite.
- **Locked liquidity**: orderbook depth is an *upper* bound on what we'd
  fill; a basket may displace its own liquidity in practice. Acceptable
  for v1 — flag in the warnings panel.
