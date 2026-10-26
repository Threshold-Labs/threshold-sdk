# Pool metering & settlement contract — design (v0)

> Thresholds and settlement policy are documented privately. This file covers only the shape of the contract.

**Status: DESIGN ONLY.** No metering or billing code ships in this SDK. This document sketches the three data shapes the contract defines.

## Position in the stack

A pool (see `src/pool.ts`) is a trust-anchored membership over shared capabilities —
here, shared *compute* (a rented container serving the pool's capabilities). Metering
answers: who used the shared thing, how much, and how does the pool's real bill get
apportioned — visibly, before any money moves.

```
outcome rows (written by the serving stack, one per request)
   └─ group by (pool_id, member) over a window ──▶ member ledger
        └─ join against the pool's real bill ──▶ settlement view (soft)
```

Threshold's role is the *contract* for these three shapes — not the meter, not the
biller. The serving stack (sideslip) writes outcome rows; the pool operator's bill
arrives from the compute vendor; the settlement view is arithmetic over both.

## 1. Outcome row (producer: the serving stack)

sideslip's outcome-row schema is resource-agnostic and is gaining `member` +
`pool_id` fields (dispatched in the same program). The metering contract needs
only this projection of it:

```ts
/** One request against a pool-served capability. Written at response time. */
interface PoolOutcomeRow {
  decisionId: string      // unique per request — the dedupe/audit key
  poolId: string          // which pool's shared resource served it
  member: string          // credential grantee (thld_va_ sub) — NOT a display name
  capabilityId: string    // the capability the request invoked
  at: string              // ISO timestamp
  tokens?: number         // input+output, when the resource is model inference
  wallclockMs: number
  resultClass: 'ok' | 'error' | 'timeout'
}
```

Invariants:
- `member` comes from the **verified credential** (`gatePoolRequest` payload), never
  from a request parameter. The meter inherits the gate's identity, or it lies.
- Rows are append-only. Corrections are new rows referencing the same `decisionId`.
- A request that fails the gate writes **no row** — unauthorized traffic is not
  meterable usage.

## 2. Member ledger (pure group-by)

```ts
interface MemberLedgerEntry {
  poolId: string
  member: string
  window: { from: string; to: string }
  requests: number
  tokens: number          // sum where present
  wallclockMs: number
  errorRate: number       // errors+timeouts / requests — disputes start here
}
```

The ledger is a *derivation*, recomputable from rows at any time — no stored
balances, no mutation. If the ledger and the rows ever disagree, the rows win.

## 3. Settlement view (soft)

```ts
interface SettlementView {
  poolId: string
  window: { from: string; to: string }
  bill: { total: number; currency: string; source: string }  // the real vendor bill
  reconciliation: {
    meteredShareOfBill: number   // fraction of billed time covered by metered usage
    residual: number             // idle/overhead cost not attributable to any member
  }
  shares: Array<{
    member: string
    basis: 'wallclock' | 'tokens'  // one basis per pool per window, declared up front
    fraction: number               // member usage / total metered usage
    amount: number                 // member's apportioned amount of the bill
  }>
  residualPolicy: 'anchor-absorbs' | 'split-evenly' | 'carry-forward'
}
```

Soft means: this view is **advisory and inspectable** — every member can see the
bill, the basis, their rows, and everyone's fractions. Money moves outside the
system.

Basis, residual policy and reconciliation tolerance are policy choices; they are documented privately.

## Consent interaction

Opting out (`OptOutRecord`) excludes a member's *content* from index/artifact; it
does not erase their *usage* — rows they generated remain in the ledger (they
consumed shared compute). The two axes never share a code path.
