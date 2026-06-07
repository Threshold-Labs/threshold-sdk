# Threshold — Developer Guide

Integrate your app with the Threshold trust graph. Your app declares capabilities it provides, composes capabilities it needs, and the trust graph governs what data flows between them.

## Base URL

```
https://thresholdlabs.io
```

## Core concepts

**Capability** — a trust-bounded service your app provides or consumes. Not a feature — a service with its own data, trust level, and lifecycle. "Parse WhatsApp exports" is a capability. "Button that parses WhatsApp" is a feature.

**Trust level** — how much data flows through a capability: `metadata-only`, `redacted`, `partial`, `full`, `subgraph`. Set by the capability owner, enforced by credentials.

**App token** (`thld_`) — identifies your app. Used for capability CRUD, signal push/read, heartbeat. Doesn't expire unless revoked.

**Credential** (`thld_va_`) — a signed JWT that Threshold issues when one app needs data from another. The credential encodes the trust level. The data flows directly between apps — Threshold is never in the data path.

---

## 0. Try it cold — no account needed

Everything below runs against the production trust graph at thresholdlabs.io. But the differentiated thing — **trust-gated cross-user data flow** — is runnable on your laptop in two minutes, with no Threshold account, no token, no network:

```bash
# One-time: the package lives on GitHub Package Registry, which requires auth
# even for public packages. Any GitHub PAT with read:packages works. In ~/.npmrc:
#   @threshold-labs:registry=https://npm.pkg.github.com
#   //npm.pkg.github.com/:_authToken=<your-github-pat>

npx -p @threshold-labs/integration threshold-dev    # mock trust graph + ES256 credential issuer on :8787
```

(Plain `npx threshold-dev` works inside a project that already installed the package. Cold, use the `-p` form — a bare `npx threshold-dev` would resolve against public npm, where the name isn't ours.)

The dev server seeds a tiny world: two users (tokens `thld_dev_alice` / `thld_dev_bob`) with a symmetric `friend` trust edge. It generates an ephemeral ECDSA P-256 keypair at startup and signs **real** `thld_va_` credentials — verification on your side is cryptographically honest, just against the dev key instead of the production key.

Walk the whole loop:

```typescript
import { declareCapability, resolveCapability, requestDataAccess } from '@threshold-labs/integration/capability'
import { verifyDataCredential } from '@threshold-labs/integration/vault'
import { projectByTrust } from '@threshold-labs/integration/redact'

const baseUrl = 'http://localhost:8787'

// 1. Alice declares a capability — partial data, friends and up
await declareCapability({
  id: 'interest-graph',
  name: 'Interest Graph',
  description: 'Per-person interest profiles.',
  type: 'graph',
  trustLevel: 'partial',
  minimumTrust: 'friend',
  endpoint: 'http://localhost:4040',
}, { token: 'thld_dev_alice', baseUrl })

// 2. Bob resolves it — the trust edge decides what he sees
const cap = await resolveCapability('interest-graph', { token: 'thld_dev_bob', baseUrl })
// cap.trustLevel === 'partial'  (alice resolving her own capability would get 'full')

// 3. Bob requests trust-scoped access — the gate runs, a credential is signed
const access = await requestDataAccess('interest-graph', { token: 'thld_dev_bob', baseUrl })
// access.credential is a real signed thld_va_ JWT encoding trustLevel: 'partial'

// 4. Alice's capability endpoint verifies it LOCALLY — no callback to anyone
const { jwk, issuer } = await fetch(`${baseUrl}/dev/info`).then(r => r.json())
const payload = await verifyDataCredential(access.credential, {
  audience: 'interest-graph',
  publicJwk: jwk,    // omit both options in production — they default to the Threshold key
  issuer,
})
// payload.grantee === 'user:bob', payload.ownerId === 'user:alice', payload.trustLevel === 'partial'

// 5. The capability shapes its response to the credential's trust level
const body = projectByTrust(graph, payload.trustLevel, {
  'metadata-only': (g) => ({ people: g.nodes.length, edges: g.edges.length }),
  partial: (g) => quantizeWeights(g),
  full: (g) => g,
})
```

Three properties worth noticing:

- **The gate refuses, cryptographically.** Declare a second capability with `minimumTrust: 'close'` and bob's `requestDataAccess` throws — `friend < close`. Tamper with one byte of the credential and `verifyDataCredential` throws. Present a credential to the wrong capability and the audience check throws.
- **Threshold is never in the data path.** Step 4 verifies the signature locally with the public key. The data in step 5 flows app-to-app.
- **`projectByTrust` falls DOWN, never up.** An undefined projection level degrades to the next *more restrictive* one (`'metadata-only'` is required as the floor). The hand-rolled-if-chain footgun — an unhandled level accidentally serving the full dataset — is structurally impossible.

When you're ready for the real graph, delete `baseUrl`, `publicJwk`, and `issuer` from the calls above and use a real token. Nothing else changes — the dev server is wire-faithful to the production API.

Steps 4–5 (verify + project) collapse into one call if alice's side runs on Node — `serveVault`
stands up the whole gated endpoint (see §5b):

```typescript
import { serveVault } from '@threshold-labs/integration/serve'
import { devVerifyOptions } from '@threshold-labs/integration/dev-server'

const vault = await serveVault({
  audience: 'interest-graph',
  getData: () => graph,
  projections: { 'metadata-only': (g) => ({ people: g.nodes.length }), partial: quantizeWeights, full: (g) => g },
  ...(await devVerifyOptions(baseUrl)),
})
// bob, app-to-app: fetch(vault.url, { headers: { Authorization: `Bearer ${access.credential}` } })
```

---

## 1. Register your app

1. Create a Threshold account at [thresholdlabs.io](https://thresholdlabs.io)
2. Go to the [Ecosystem dashboard](https://thresholdlabs.io/ecosystem)
3. Click **Register app** — provide a name, slug, and domain
4. Copy your app token (`thld_...`) — shown once, store it immediately

---

## 2. Declare your capabilities

This is the first thing you do after registering. What does your app provide as a trust-bounded service?

```typescript
import { declareCapability } from '@threshold-labs/integration/capability'

await declareCapability({
  id: 'community-digest',
  name: 'Community Digest',
  description: 'Aggregated topic profiles and engagement patterns from community chat data',
  type: 'derivation',
  ownerType: 'app',
  trustLevel: 'partial',
  minimumTrust: 'acquaintance',
  cadence: { expected: 'PT24H' },  // daily
}, { token: appToken })
```

Capability types: `signal`, `connector`, `graph`, `embedding`, `vault`, `derivation`, `presentation`

If your app holds data about people who don't have Threshold accounts yet, declare custody terms:

```typescript
await declareCapability({
  id: 'member-profiles',
  name: 'Member Profiles',
  description: 'Interest profiles derived from community participation',
  type: 'graph',
  ownerType: 'app',
  trustLevel: 'partial',
  minimumTrust: 'friend',
  custody: {
    identityType: 'phone',
    identityValue: '+13035551234',
    transferOnClaim: true,       // auto-transfer when user creates Threshold account
    retainAsConsumer: true,      // app keeps read access post-transfer
    retainTrustLevel: 'colleague',
  },
}, { token: appToken })
```

---

## 3. Compose capabilities you need

What does your app consume from the ecosystem? Declare it:

```typescript
import { composeCapabilities } from '@threshold-labs/integration/capability'

await composeCapabilities('vibeswith', [
  'interest-graph',    // TF-IDF + engagement profiling
  'comms-parser',      // WhatsApp/Slack/iMessage normalization
  'local-inference',   // LLM access through the trust graph
], { token: appToken })
```

Composition is declarative — it tells the ecosystem what your app needs. At runtime, you resolve and access these capabilities through the trust graph.

---

## 4. Resolve capabilities at runtime

Before using a composed capability, resolve it to discover the endpoint, trust level, and availability:

```typescript
import { resolveCapability } from '@threshold-labs/integration/capability'

const cap = await resolveCapability('interest-graph', { token: appToken })

if (cap) {
  console.log(cap.endpoint)      // where to call
  console.log(cap.trustLevel)    // what data you'll get
  console.log(cap.availability)  // 'live' | 'stale' | 'unknown'
  console.log(cap.lastSeen)      // last heartbeat timestamp
}
```

Availability is derived from heartbeat data. If a provider isn't heartbeating, you'll see `availability: 'unknown'` — the trust graph is telling you it can't vouch for liveness.

---

## 5. Request data access

When you need actual data from a capability, request a trust-scoped credential:

```typescript
import { requestDataAccess } from '@threshold-labs/integration/capability'

const access = await requestDataAccess('interest-graph', { token: appToken })

// access.credential is a thld_va_ signed JWT
// Present it directly to the capability endpoint
const data = await fetch(access.endpoint, {
  headers: { Authorization: `Bearer ${access.credential}` },
}).then(r => r.json())
```

The credential encodes the trust level. The capability reads it and filters its response — full data for `trustLevel: 'full'`, aggregates for `'partial'`, counts only for `'metadata-only'`. Threshold issued the credential but never sees the data.

---

## 5b. Serve a trust-gated capability (Pattern 6b)

The provider side of §5. **The one-call form** (0.18.0+, Node) — gate + projection + server
in one call:

```typescript
import { serveVault } from '@threshold-labs/integration/serve'

const vault = await serveVault({
  audience: 'interest-graph',
  getData: () => graph,
  projections: {
    'metadata-only': (g) => ({ people: g.nodes.length }),  // required floor
    partial: (g) => quantize(g),
    full: (g) => g,
  },
  // dev: { publicJwk, issuer } from threshold-dev (or set TRUST_ISSUER);
  // omit in production to verify against the Threshold key.
})
// vault.url is live: GET it with a thld_va_ credential, response arrives projected.
```

That's a complete trust-gated capability server. When you outgrow one read surface
(multiple routes, POST ingestion, caching), graduate to the full template below — it's
what serveVault is made of, proven across three capabilities (interest-graph,
calendar-graph, reading-history), each shaped the same way. Three pieces:

**1. A projection module** — one function, one `projectByTrust` call, every rung a conscious
decision. Decide ONCE what each trust level reveals, in a file a reviewer can read top to bottom:

```typescript
// src/projection.ts
import { projectByTrust } from '@threshold-labs/integration/redact'

export function projectThing(data: Thing[], trustLevel: string) {
  return projectByTrust(data, trustLevel, {
    'metadata-only': (all) => ({ count: all.length }),          // required floor
    redacted: (all) => all.map(anonymize),                       // structure, no identity
    partial: (all) => all.map(({ sensitive, ...rest }) => rest), // strip the worst field
    full: (all) => all,                                          // owner only
  })
}
```

Fall-through is DOWNWARD only — an undefined rung degrades to the more restrictive one. Decide
which field is your most sensitive (page snippets, meeting titles, raw weights) and pick the
rung where it stops crossing.

**2. The gate at every read endpoint** — three lines:

```typescript
import { gateDataRequest } from '@threshold-labs/integration/vault'

const gate = await gateDataRequest(req.headers.authorization, { audience: 'your-capability-id' })
if (!gate.ok) return respond(gate.status, { error: gate.error })
respond(200, projectThing(data, gate.payload.trustLevel))
```

For local dev, accept injectable keys and fall back to `TRUST_ISSUER`:

```typescript
if (!opts.publicJwk && process.env.TRUST_ISSUER) {
  Object.assign(opts, await devVerifyOptions(process.env.TRUST_ISSUER))
}
```

Also: export a `startYourServer(options)` + run-directly guard instead of listening on import,
so tests can drive the server cold.

**3. A cold e2e test** against `createDevServer()` — no account, no network. The three proven
test flavors, each catching a different failure surface:

| Flavor | Asserts | First proven in |
|--------|---------|-----------------|
| Rung projection | a `partial`/`redacted` caller gets the projected shape AND a leak-scan regex over the raw response finds none of the sensitive terms | interest-graph (partial), calendar-graph (redacted) |
| Forged/missing credential | bare request → 401, tampered JWT → 401 | all three |
| The trust gate itself | declare `minimumTrust` ABOVE the dev world's `friend` edge → `requestDataAccess` is refused before your endpoint is ever touched | reading-history |

The leak scan is the highest-value assertion: serialize the whole response and
`assert.doesNotMatch(raw, /term1|term2|.../)` with terms that exist only in the rungs that
must not cross.

**When the gate is NOT needed** — pure functions (caller POSTs data, gets a derivation of it
back: the caller already owns the input) and caller-supplied-credential pass-throughs (caller
brings their own OAuth token: output goes to the token-bearer). The gate is for surfaces
serving a RETAINED corpus the owner holds. See the gate-vs-knob doctrine in `./redact` for
the boundary rule.

---

## 6. Report heartbeat (if you provide capabilities)

If your app runs infrastructure — indexers, inference endpoints, crawlers — report liveness so consumers know you're up:

```typescript
import { heartbeat } from '@threshold-labs/integration/capability'

// On startup and every 60s
setInterval(() => {
  heartbeat('community-digest', {
    token: appToken,
    intervalMs: 60_000,
    metadata: { version: '0.2.0', memberCount: 650, model: 'qwen2.5-7b' },
  })
}, 60_000)
```

Staleness threshold: 3x your declared interval, or 10 minutes if none declared. Consumers see this in `resolveCapability()` as `availability: 'live' | 'stale' | 'unknown'`.

---

## 7. Push and read signals

Signals are lightweight derived heuristics. Your data stays local — you push only the computed output.

```typescript
import { pushSignal, readSignal } from '@threshold-labs/integration/signals'

// Push after each compute cycle
await pushSignal('vibeswith', {
  communityDigest: { topics, engagement, memberCount },
  derivedAt: new Date().toISOString(),
}, { token: appToken })

// Read another app's signal (if granted or same user)
const ideas = await readSignal('ideas', { token: appToken })
if (ideas) {
  console.log(ideas.signal.clusters)  // capability clusters from the ideas app
}
```

- One row per user per source — each push overwrites
- Cross-app reads for the same user work without explicit grants
- Cross-user reads require trust edges (grants)
- Failures should be silent to users

**Freshness is consumer-defined:**
```typescript
const staleMs = 5 * 60 * 1000  // 5 minutes for real-time features
if (Date.now() - new Date(signal.pushedAt).getTime() > staleMs) return
```

---

## 8. Add Login with Threshold (optional)

Auth upgrades the experience — it never gates core functionality. **Your app must work without auth.**

```typescript
import { ThresholdAuth } from '@threshold-labs/integration/auth'

const auth = new ThresholdAuth({
  appId: 'your-app-id',
  appToken: 'thld_...',
})

// Start login (redirects to thresholdlabs.io)
auth.startLogin({ redirectUri: 'https://yourapp.com/callback' })

// Handle callback
const session = await auth.handleCallback(code, redirectUri)
// session.token is a thld_ut_ user token
// session.userId is the Threshold user ID

// Get user info
const user = await auth.getUserinfo()
```

Three tiers — your app should handle all of them:

| Tier | Identity | What works |
|------|----------|-----------|
| **Ephemeral** | None | Full app functionality, device-local |
| **Device** | `crypto.randomUUID()` in localStorage | Cross-session continuity, no account needed |
| **Authenticated** | `thld_ut_` user token | Cross-device, cross-app, trust graph participation |

---

## Token types

| Token | Prefix | What it represents |
|-------|--------|--------------------|
| **App token** | `thld_` | "I am this app" — used for capability CRUD, signals, heartbeat |
| **User token** | `thld_ut_` | "This user authenticated via Login with Threshold" |
| **Capability grant** | `thld_cg_` | "This user granted me access to this specific capability" |
| **Vault credential** | `thld_va_` | "Threshold certifies I can access this data at this trust level" |
| ~~Connect token~~ | ~~`thld_ct_`~~ | ~~Deprecated~~ — use capability grants (`thld_cg_`) |

All tokens are passed as:
```
Authorization: Bearer <token>
```

---

## Graph signatures

If your app uses `@threshold-labs/core` to compute structural signatures, push them to track drift over time:

```
POST /api/apps/:slug/signature
Authorization: Bearer thld_...

{ "viewName": "main", "signature": { ...computeSignature() output } }
```

Read: `GET /api/apps/:slug/signature`
History: `GET /api/apps/:slug/signature/history?viewName=main&limit=50`

Push on meaningful state change, debounced to once per 60s.

---

## Vault endpoints

If your app serves data to other apps, register a vault:

```
POST /api/apps/:slug/vault
Authorization: Bearer thld_...

{
  "endpoint": "https://your-app.example.com/vault",
  "capabilities": [
    { "id": "edges-read", "name": "Graph Edges", "type": "graph",
      "trustLevel": "partial", "minimumTrust": "colleague" }
  ]
}
```

Verify incoming credentials locally — no callback to Threshold:

```typescript
import { verifyVaultCredential } from '@threshold-labs/integration/vault'

const payload = await verifyVaultCredential(bearerToken, { audience: 'your-slug' })
// payload.grantee — who is requesting
// payload.scope — what they're allowed to read
// payload.expiresAt — when the credential expires
```

For trust-scoped data access (Pattern 6b):

```typescript
import { verifyDataCredential } from '@threshold-labs/integration/vault'

const payload = await verifyDataCredential(bearerToken, { audience: 'your-capability' })
// payload.trustLevel — filter your response accordingly
// payload.ownerId — whose data is being accessed
```

---

## Custody (for pre-claim data)

If your app holds data about people before they have Threshold accounts, declare custody. Types are available now (`CustodyTerms`, `CustodyRecord`, `CustodyClaim`). Endpoints coming soon — vibeswith is the forcing function.

The lifecycle: **custodial** → **claimable** → **transferring** → **sovereign**

```typescript
import type { CustodyTerms } from '@threshold-labs/integration'

const terms: CustodyTerms = {
  identityType: 'phone',
  identityValue: '+13035551234',
  transferOnClaim: true,
  retainAsConsumer: true,
  retainTrustLevel: 'colleague',
}
```

---

## Error contract

All errors return `{ "error": string }`:

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid or missing token | Check token, don't retry |
| 403 | Token valid but wrong app/scope | Check slug matches token's app |
| 404 | Resource not found | Check slug is registered |
| 422 | Malformed payload | Fix request body |
| 429 | Rate limited | Back off, check Retry-After |
| 503 | Temporarily unavailable | Retry with exponential backoff |

CORS: All endpoints support `Access-Control-Allow-Origin: *`. Browser apps call the API directly — no server-side proxy needed.

---

## Filing issues

Found a gap? [Open an issue](https://github.com/Threshold-Labs/threshold-sdk/issues).

Run the auditor against your codebase to identify capability opportunities:
```bash
claude -p "$(curl -s https://thresholdlabs.io/api/prompts/audit) --- Audit this codebase."
```

Full contract: `import { CAPABILITY_CONTRACT } from '@threshold-labs/integration/contract'`
