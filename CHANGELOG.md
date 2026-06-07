# Changelog — @threshold-labs/integration

Versioning: **patch** = doc-only · **minor** = new pattern / new known source / new scope · **major** = breaking change to an existing endpoint or auth model. `INTEGRATION_CONTRACT.version` + `AUDITOR_VERSION` bump together only when the HTTP interface itself changes.

## 0.18.0 — 2026-06-07

**`./serve`: `serveVault`** — the one-call trust-gated capability server, completing the last Tier 0 roadmap bullet (the serving half of the vault exchange; the verification half shipped in v0.13/v0.17). `serveVault({audience, getData, projections, port?, publicJwk?, issuer?})` → gated `GET /data` (projected by credential trust level, `?params` → subgraph) + open `GET /health`. Absorbed from the skeleton three capabilities hand-rolled (interest-graph, calendar-graph, reading-history). Node-only subpath; Workers surfaces keep composing `gateDataRequest` + `projectByTrust` directly. The floor, not the ceiling — multi-route capabilities graduate to the §5b template.

## 0.17.3 — 2026-06-07

**Fix: bare `npx threshold-dev` crashed** when no `PORT` env was set — `Number(undefined) ?? 8787` stays `NaN` (NaN is not nullish), so the bin tried `listen(NaN)`. Caught by the first cold `npx` smoke test minutes after 0.17.2 was published; every prior test passed `options.port` explicitly. Regression test added (21 tests). Also: README/DEVELOPERS install steps now include the GitHub Package Registry `.npmrc` setup — GitHub requires auth (`read:packages` PAT) even for public packages.

## 0.17.2 — 2026-06-07

Doc-only: **DEVELOPERS.md §5b — the Pattern 6b provider template**, canonicalized from three field adoptions (interest-graph, calendar-graph, reading-history). The three-piece shape (projection module / 3-line gate / cold e2e), the three proven test flavors (rung projection + leak scan, forged credential, the trust gate itself refusing), and the when-NOT-to-gate rule (pure functions, caller-supplied-credential pass-throughs — from threshold-capabilities' hazard sweep).

## 0.17.1 — 2026-06-07

Doc-only: **the gate-vs-knob boundary**, canonical in `./redact`. `projectByTrust`'s `trustLevel` has two legitimate sources — a verified credential (`gateDataRequest`; required across any trust boundary) or a caller-specified knob (legitimate only where the transport IS the boundary: MCP stdio, loopback). Forward hazard documented: a knob surface whose binding widens must switch to the gate, or `trust=full` becomes an unauthenticated firewall hole. Converged independently by web-activity `1c40253` ⇄ project-control `218ac9f`.

## 0.17.0 — 2026-06-07

**`./vault`: `gateDataRequest`** — the non-throwing capability front door for Pattern 6b. Takes the Authorization header value (transport-agnostic: node:http, fetch handlers, Workers) and returns `{ok: true, payload} | {ok: false, status: 401, error}` — maps directly onto a response. **`./dev-server`: `devVerifyOptions(url)`** — fetches `{publicJwk, issuer}` from a running threshold-dev's `/dev/info`. Both canonicalized from interest-graph v0.3 + calendar-graph v0.1, which hand-rolled the same gate boilerplate.

## 0.16.0 — 2026-06-07

**`./redact`: canonical `SENSITIVE_GOVERNANCE` boundary.** `{client, personal-sensitive}` surfaces ONLY at trust level `full` — absorbed after web-activity and project-control converged on the same set independently at their read surfaces. New: `SENSITIVE_GOVERNANCE` set, `governanceVisibleAt(governance, trustLevel)`, `filterSensitive(items)` (generic over `{governance}`, for use inside projection rungs so downward fallback can never leak). `subgraph` does not cross the line: a shape grant is not a sensitivity grant.

## 0.15.0 — 2026-06-07

**`./memory-connector`: `'browser-history'` SourceId** + the tagless-firewall caveat on `Governance` (issue #62): connectors normalizing tagless URL streams must match client tokens against the domain when deriving governance — a tag-only firewall leaks client-domain visits.

## 0.14.1 — 2026-06-07

`./dev-server` subpath export — `createDevServer()` programmatic use (tests, fixtures), not just the `threshold-dev` bin.

## 0.14.0 — 2026-06-07

**`./redact`: `projectByTrust`** — trust-level response projection, the capability-side half of Pattern 6b. Fall-DOWN-only semantics: an undefined projection level degrades to the next *more restrictive* one; `'metadata-only'` is the required floor; `'subgraph'` requires an explicit projection (no safe automatic fallback for a caller-specified filter); unknown level throws. Kills the if-chain-falls-up-to-full footgun.

Also: test suite (`node:test` over `dist/__tests__`, zero test deps) — pure logic + a cold end-to-end of the trust-gated flow.

## 0.13.0 — 2026-06-07

**`threshold-dev` bin — Tier 0.** Local mock trust graph + ES256 token issuer (zero deps, `node:http` + webcrypto). Seeded alice/bob world with a `friend` edge; ephemeral P-256 keypair signs REAL `thld_va_` credentials; wire-faithful to the production API.

**`./vault`: injectable verification.** `verifyVaultCredential`/`verifyDataCredential` gain `publicJwk` and `issuer` options (defaulting to the production key/issuer — existing callers unchanged). This was the root cause of the "pattern, not runtime" cold-start finding: the verifiers pinned the production signing key, so the core flow could not be exercised locally.

## 0.12.0 — 2026-06-06

**`threshold-registry` bin** — readable registry digest for humans + agents (`THRESHOLD_TOKEN`/`THRESHOLD_JWT` env, `--json`, `--base-url`).

## 0.11.0 — 2026-06-06

**`./memory-connector` — CANONICAL home for `MemoryStoreConnector`.** The contract external memory stores implement (Obsidian, memory-keeper, Karakeep, OneTab/web-activity), formerly three byte-coordinated mirrors in project-control, obsidian-connector, and web-activity-connector. Mirrors collapse to `export * from '@threshold-labs/integration/memory-connector'`. Intake for contract gaps = GitHub issue titled `[Pattern N] MemoryStoreConnector: <gap>`.

## 0.10.0 — 2026-06-06

**`./capability`: readable registry.** `listCapabilities()` (normalizes D1 snake_case rows, parses declaration JSON, tolerates malformed legacy rows) + `registryMarkdown()` (agent-pasteable check-before-building digest).

## 0.9.1 and earlier

Pre-changelog. Capability contract, auth client (Login with Threshold), capability helpers (declare/resolve/compose/requestDataAccess), vault credential verification, signals push/read, custody types, heartbeat, auditor prompt.
