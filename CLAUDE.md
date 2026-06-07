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
| `src/memory-connector.ts` | `MemoryStoreConnector` — CANONICAL memory-store contract (`./memory-connector` subpath). Pure types. Formerly 3 mirrors: project-control, obsidian-connector, web-activity-connector |
| `src/dev-server.ts` | `threshold-dev` bin — local mock trust graph + ES256 token issuer (Tier 0: the trust-gated flow, runnable cold) |
| `src/redact.ts` | `projectByTrust` (`./redact`) — trust-level response projection with fall-DOWN-only semantics; capability-side half of Pattern 6b. Also CANONICAL `SENSITIVE_GOVERNANCE` boundary ({client, personal-sensitive} → full-only) + `governanceVisibleAt`/`filterSensitive` |
| `src/vault.ts` (gate) | `gateDataRequest` — non-throwing Pattern 6b front door for capability endpoints (header value in, `{ok,payload}\|{ok:false,401,error}` out); pairs with `devVerifyOptions` in dev-server |
| `src/cli.ts` | `threshold-registry` bin — readable registry digest for humans + agents |
| `src/prompts/auditor.ts` | `THRESHOLD_AUDITOR_PROMPT` — the integration auditor prompt, served publicly |
| `src/prompts/index.ts` | Re-exports for the `./prompts` subpath |
| `src/index.ts` | Root export (re-exports everything) |

Note: `./contract` is the *capability/trust* contract; `./memory-connector` is the
*memory-store* contract. Different things — don't merge them.

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
npm test               # node:test over dist/__tests__ (build first; zero test deps)
```

The package has no runtime dependencies. Since v0.10–0.13 it carries real
logic (registry normalization/rendering, dev-server trust gate, credential
verification) — covered by `src/__tests__/` (pure logic + a cold end-to-end
of the trust-gated flow against threshold-dev). Add tests with new logic.

## Consumer list

| Consumer | Import path | What it uses |
|----------|-------------|--------------|
| threshold-react worker | `./prompts` | Serves auditor prompt at /api/prompts/audit |
| threshold-react pages | `./contract` | Powers /developers, /developers/audit |
| project-control | `./memory-connector`, `./redact` | Contract re-export; `filterSensitive` + `projectByTrust` at /api/connectors read surfaces |
| obsidian-connector | `./memory-connector` | Contract re-export (mirror collapsed) |
| web-activity-connector | `./memory-connector`, `./redact` | Contract re-export; trust-projected `web_read` |
| threshold-capabilities: overlap | `./vault`, `./redact`, `./dev-server`, `./capability` | The multiplayer keystone — full Tier-0 stack |
| threshold-capabilities: interest-graph, calendar-graph, reading-history | `./vault` (`gateDataRequest`), `./redact`, `./dev-server` | Pattern 6b read surfaces |

**Published to GitHub Package Registry** (v0.17.2+, 2026-06-07). External consumers need
`@threshold-labs:registry=https://npm.pkg.github.com` + a PAT with `read:packages` in `.npmrc`
(GitHub requires auth even for public packages). Local sibling repos keep the
`"file:../../threshold-complete/threshold-sdk"` link — it's the right choice for same-machine
co-development (changes land without republish). When adding a new consumer, update this table.

## Relationship to @threshold-labs/core

`@threshold-labs/core` — pure graph algorithms (computeSignature, etc.), no HTTP.
`@threshold-labs/integration` — HTTP interface, auth contracts, prompts. No algorithms.

They are intentionally separate: core can be used without any Threshold account;
integration is what connects a core-powered app to the Threshold cloud.
