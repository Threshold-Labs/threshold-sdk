# threshold-sdk — Integration Interface

This is the public integration surface for Threshold. External apps depend on
this package to integrate with the Threshold trust graph.

**npm:** `@threshold-labs/integration`
**GitHub:** https://github.com/Threshold-Labs/threshold-sdk
**Public endpoint:** https://thresholdlabs.io/api/prompts/audit

## What lives here

| File | Purpose |
|------|---------|
| `src/contract.ts` | `INTEGRATION_CONTRACT` — typed definition of every endpoint, auth type, and schema |
| `src/prompts/auditor.ts` | `THRESHOLD_AUDITOR_PROMPT` — the integration auditor prompt, served publicly |
| `src/prompts/index.ts` | Re-exports for the `./prompts` subpath |
| `src/index.ts` | Root export (re-exports everything) |

## Intake process

External apps file GitHub issues here when the integration interface needs
to change. The format for an interface proposal:

```
Title: [Pattern N] <short description of the gap>

App: <app name / slug>
Pattern: 1 (Signal Push) | 2 (Signal Read) | 3 (Graph Signature)

Problem:
What the current interface doesn't support.

Proposed change:
What the endpoint, schema, or auth model should look like.

Workaround (if any):
What the app is doing today.
```

PRs are welcome — but changes to `contract.ts` must be mirrored in
`threshold-react/src/worker.ts` before merging (the contract and the
implementation must stay in sync).

## Versioning

Both `INTEGRATION_CONTRACT.version` and `AUDITOR_VERSION` in `src/prompts/auditor.ts`
should be bumped together when the interface changes. Follow semver:
- **patch**: doc-only changes, clarifications, governance notes
- **minor**: new pattern, new known source, new scope
- **major**: breaking change to an existing endpoint or auth model

After bumping: build, publish to npm, then redeploy threshold-react so the
public endpoint serves the updated prompt.

## Build & test

```bash
npm run build          # compiles src/ → dist/
npm run dev            # watch mode
```

The package has no runtime dependencies — it's pure TypeScript types and
string constants. No test suite needed until logic is added.

## Consumer list

| Consumer | Import path | What it uses |
|----------|-------------|--------------|
| threshold-react worker | `@threshold-labs/integration/prompts` | Serves auditor prompt at /api/prompts/audit |
| threshold-react pages | `@threshold-labs/integration/contract` | Powers /developers, /developers/audit |
| project-control | (planned) | Will import contract for type-safe signal shape |

When adding a new consumer, update this table.

## Relationship to @threshold-labs/core

`@threshold-labs/core` — pure graph algorithms (computeSignature, etc.), no HTTP.
`@threshold-labs/integration` — HTTP interface, auth contracts, prompts. No algorithms.

They are intentionally separate: core can be used without any Threshold account;
integration is what connects a core-powered app to the Threshold cloud.
