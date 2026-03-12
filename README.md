# @threshold-labs/integration

The public integration surface for Threshold — a trust graph for user-owned capabilities.

## The problem

Every app you use holds a slice of your data. None of them talk to each other unless you hand over credentials and hope for the best. You can't see what you've shared, you can't revoke it cleanly, and you have no way to know whether the tradeoff was worth it.

Threshold inverts this. Users own their data in vaults. Apps declare the capabilities they need. A trust graph governs what flows between them — and Threshold never sees the data. It issues credentials; the data flows directly between apps. This is an architectural guarantee, not a policy promise.

The long-term trajectory is a **certifying protocol**: trust enforcement moves from architecture to cryptography, where Threshold is mathematically incapable of accessing vault data regardless of intent. Apps integrating today are building on a surface designed with that end state in mind.

## What this package does

`@threshold-labs/integration` is a zero-dependency TypeScript SDK that gives your app everything it needs to participate in the Threshold trust graph:

- **Capability contract** — typed definitions for every endpoint, auth model, and schema
- **Auth client** — Login with Threshold (OAuth flow, three-tier auth: ephemeral → device → authenticated)
- **Capability helpers** — declare, resolve, compose, and request data access for capabilities
- **Vault verification** — verify Threshold-issued credentials locally using ECDSA P-256, without calling back to Threshold
- **Auditor prompt** — point Claude at your codebase to identify capability opportunities

## Install

```bash
npm install @threshold-labs/integration
```

## Quick start

### Declare a capability

Users own capabilities. Your app helps them declare what they're willing to share.

```ts
import { declareCapability } from '@threshold-labs/integration/capability'

await declareCapability({
  id: 'focus-tracker',
  name: 'Focus Tracker',
  description: 'Derived focus score from active window patterns',
  type: 'signal',
  ownerType: 'user',
  trustLevel: 'partial',
  minimumTrust: 'acquaintance',
  cadence: { expected: 'PT1H' },
}, { token: clerkJwt })
```

### Resolve and access data

When app B needs data from app A, it resolves the capability and requests a trust-scoped credential. Threshold stays out of the data path.

```ts
import { resolveCapability, requestDataAccess } from '@threshold-labs/integration/capability'

// Discover where the capability lives and what trust level you have
const cap = await resolveCapability('cap-uuid', { token: grantToken })

// Get a signed credential to call the capability directly
const access = await requestDataAccess('cap-uuid', { token: grantToken })
const data = await fetch(access.endpoint, {
  headers: { Authorization: `Bearer ${access.credential}` },
}).then(r => r.json())
```

### Login with Threshold

Three-tier auth that never gates core functionality — it upgrades experience.

```ts
import { ThresholdAuth } from '@threshold-labs/integration/auth'

const auth = new ThresholdAuth({
  appId: 'my-app',
  appToken: 'thld_...',
})

// Start OAuth flow
auth.startLogin({ redirectUri: 'https://myapp.com/callback' })

// After redirect
const session = await auth.handleCallback(code, redirectUri)
```

### Verify vault credentials locally

Capabilities verify Threshold-issued credentials without any network call. The public key is baked into the SDK.

```ts
import { verifyVaultCredential } from '@threshold-labs/integration/vault'

const { grantee, scope, expiresAt } = await verifyVaultCredential(
  bearerToken,
  { audience: 'my-app' }
)
```

### Audit a codebase for capabilities

The SDK ships an auditor prompt you can point Claude at to find capability opportunities in any codebase:

```bash
claude --prompt https://thresholdlabs.io/api/prompts/audit
```

## Capability types

| Type | What it is | Example |
|------|-----------|---------|
| `signal` | Derived heuristic pushed periodically | focus-score, mood-state |
| `connector` | OAuth/API bridge to an external service | spotify-connector |
| `graph` | Entity-relationship structure | interest-graph |
| `embedding` | Vector representation | taste-embedding |
| `vault` | Raw data behind access control | listening-history |
| `derivation` | Computed from other capabilities | spotify-taste |
| `presentation` | UI/display capability | card-renderer |

## Trust levels

```
metadata-only → redacted → partial → full → subgraph
```

Each capability declares the trust level it operates at and the minimum relationship depth required to access it (`acquaintance` → `colleague` → `client` → `friend` → `close` → `partner`).

This is what makes Threshold different from binary access control: you can see the *shape* of data without seeing the content. A graph's structural signature — density, clustering coefficient, degree distribution — reveals its nature without disclosing what's inside. As trust deepens, resolution increases.

## Auth model

| Token | Prefix | Purpose |
|-------|--------|---------|
| App token | `thld_` | Identifies the app |
| Capability grant | `thld_cg_` | Scoped per-capability access |
| User token | `thld_ut_` | Issued after Login with Threshold |
| Vault credential | `thld_va_` | Short-lived JWT for vault/data access |

## Subpath exports

```ts
import { CAPABILITY_CONTRACT } from '@threshold-labs/integration/contract'
import { THRESHOLD_AUDITOR_PROMPT } from '@threshold-labs/integration/prompts'
import { ThresholdAuth } from '@threshold-labs/integration/auth'
import { declareCapability, resolveCapability } from '@threshold-labs/integration/capability'
import { verifyVaultCredential, verifyDataCredential } from '@threshold-labs/integration/vault'
```

## Why structural signatures, not tokens

Threshold will never see the tokens. That's a feature.

The one artifact Threshold holds — structural signatures — are points in a high-dimensional topological space. They describe the *shape* of a graph without revealing content. This is mathematically guaranteed. What you can do with signature trajectories over time is attractor analysis: stable configurations emerge, transient ones decay. Intelligence about patterns and relationships without any content crossing any boundary.

This is why the analysis layer is built on attractors and dimensionality reduction rather than language models. LLMs need tokens. Threshold's value comes from what it can say about structure when the tokens stay in the vault.

## Build

```bash
npm run build    # compile src/ → dist/
npm run dev      # watch mode
```

Zero runtime dependencies — pure TypeScript types and functions.

## Links

- [Vision](./VISION.md) — full architectural thesis
- [Positioning](./POSITIONING.md) — how Threshold relates to IPFS, Solid, Runpod
- [Developer guide](./DEVELOPERS.md)
- [Public endpoint](https://thresholdlabs.io/api/prompts/audit) — auditor prompt
- [GitHub Issues](https://github.com/Threshold-Labs/threshold-sdk/issues) — interface proposals

## License

MIT
