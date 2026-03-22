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
