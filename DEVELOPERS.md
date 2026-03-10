# Threshold — Developer Guide

Quick reference for external apps integrating with Threshold.

## Base URL

```
https://thresholdlabs.io
```

All API endpoints live here. No staging environment yet — file an issue if you need one.

## Registering your app

1. Create a Threshold account at [thresholdlabs.io](https://thresholdlabs.io)
2. Go to the [Ecosystem dashboard](https://thresholdlabs.io/ecosystem)
3. Click **Register app** — provide a name, slug (lowercase, hyphens only), and domain
4. Copy your app token — it's shown **once**, store it immediately

Your app token looks like `thld_` followed by 64 hex characters.

## Authentication

Three token types are in use:

| Token | Prefix | Used for |
|-------|--------|----------|
| App token | `thld_` | All external integration endpoints (signal push/read, graph signature, vault credential) |
| Clerk JWT | (varies) | Dashboard API calls and logged-in user operations |
| Connect token | `thld_ct_` | App reading a specific user's Threshold-connected integration data (e.g. Spotify) |

App tokens identify your app and its owner. They don't expire unless revoked.
Revoke and reissue from the Ecosystem dashboard.

All tokens are passed as:
```
Authorization: Bearer <token>
```

## CORS

All endpoints support CORS with `Access-Control-Allow-Origin: *`.
**Browser apps can call the API directly — no server-side proxy required.**

---

## Pattern 1 — Signal Push

Push a derived heuristic after each compute cycle. One call per cycle, batch all signals in one body.

```
POST https://thresholdlabs.io/api/signals/:source
Authorization: Bearer thld_...
Content-Type: application/json

{ ...your signal fields }
```

- `:source` is your app slug (e.g. `ai-dj`, `project-control`)
- No source registration step — the slug is self-declared
- One row per user per source; each push overwrites the previous
- Failures should be silent to users — treat as fire-and-forget

**Success response:**
```json
{ "ok": true, "pushedAt": "2026-02-25T18:00:00.000Z" }
```

---

## Pattern 2 — Signal Read

Read the latest signal pushed for the authenticated user from any source.

```
GET https://thresholdlabs.io/api/signals/:source
Authorization: Bearer thld_...   (or Clerk JWT)
```

- App token: returns the signal for the token's owner
- Clerk JWT: returns the signal for the logged-in user
- Any app token for user X can read any signal pushed for user X from any source — no explicit grant required
- Cross-user reads (user A reading user B's signals) require trust edges — coming in the next iteration

**Success response:**
```json
{
  "source": "project-control",
  "signal": { ...signal fields as pushed },
  "pushedAt": "2026-02-25T18:00:00.000Z"
}
```

**Freshness:** `pushedAt` is informational — the server does not enforce a TTL. Consumers define their own staleness threshold. Recommended defaults: 5 min for real-time features, 30 min for dashboards, 24 h for analytics.

```typescript
if (Date.now() - new Date(pushedAt).getTime() > YOUR_THRESHOLD_MS) return;
```

---

## Pattern 3 — Graph Signature

Push a structural signature of your app's graph, computed via `@threshold-labs/core`.

```
POST https://thresholdlabs.io/api/apps/:slug/signature
Authorization: Bearer thld_...
Content-Type: application/json

{ "viewName": "main", "signature": { ...computeSignature() output } }
```

- `:slug` must match your registered app slug
- `viewName` is scoped to your app — no prefix needed
- Push on meaningful state change, not continuously (debounce: skip if <60s since last push)

**Read signatures:**
```
GET https://thresholdlabs.io/api/apps/:slug/signature
```
Returns `{ slug, views: [{ viewName, signature, lastSync }] }`.

**History:**
```
GET https://thresholdlabs.io/api/apps/:slug/signature/history?viewName=main&limit=50
```
Returns snapshots ordered newest-first. Use for drift visualization.

---

## Pattern 4 — Vault

Apps register a vault endpoint and declare capabilities. Requesting apps get a short-lived signed credential from Threshold and present it directly to the vault — **Threshold is never in the data path**.

### Registering a vault

```
POST https://thresholdlabs.io/api/apps/:slug/vault
Authorization: Bearer <clerk-jwt>
Content-Type: application/json

{
  "endpoint": "https://your-app.example.com/vault",
  "capabilities": [
    {
      "id": "edges-read-current",
      "name": "Current graph edges",
      "description": "Read-only access to the current project graph",
      "type": "graph",
      "trustLevel": "partial",
      "minimumTrust": "colleague"
    }
  ]
}
```

Capabilities use the `CapabilityDeclaration` type from `@threshold-labs/integration`. Import it:

```typescript
import type { CapabilityDeclaration } from '@threshold-labs/integration/contract'
```

### Reading vault capabilities (public)

```
GET https://thresholdlabs.io/api/apps/:slug/vault/capabilities
```

No auth required. Returns the vault endpoint and declared capabilities.

### Requesting a vault credential

```
POST https://thresholdlabs.io/api/apps/:slug/vault/credential
Authorization: Bearer thld_...
Content-Type: application/json

{ "scope": "edges:read:current" }
```

Requires an `app_data_grant` for the requested scope on the target vault. Grant scopes are dynamically validated against the vault's declared capabilities — any declared capability ID is a valid grant scope.

**Response:**
```json
{
  "credential": "thld_va_eyJ...",
  "vaultEndpoint": "https://your-app.example.com/vault",
  "expiresAt": "2026-02-25T18:15:00.000Z"
}
```

TTL: 15 minutes. Cache the credential and refresh 60s before expiry.

### Verifying vault credentials (vault server side)

```typescript
import { verifyVaultCredential } from '@threshold-labs/integration/vault'

const payload = await verifyVaultCredential(token)
// payload.sub = requesting app slug
// payload.scope = granted scope
// payload.exp = expiry timestamp
```

No callback to Threshold required. The credential is verified locally against the public key at `https://thresholdlabs.io/.well-known/jwks.json` (ECDSA P-256, kid: `vault-signing-1`). Cache the JWKS — it rotates infrequently.

---

## Threshold-side Derivations

Threshold can derive structured signals from connected integrations and push them as Pattern 1 signals. Raw integration tokens never leave Threshold — only the derived signal is stored and readable via Pattern 2.

### Spotify Taste Signal

```
POST https://thresholdlabs.io/api/integrations/derive/spotify-taste
Authorization: Bearer thld_...   (or Clerk JWT)
```

Requires Spotify connected at [thresholdlabs.io/integrations](https://thresholdlabs.io/integrations). Derives `SpotifyTasteSignal` from top artists, top tracks, and audio features; pushes it as a `spotify-taste` signal.

**Response:**
```json
{
  "source": "spotify-taste",
  "signal": {
    "topGenres": ["indie", "electronic", "jazz"],
    "audioFeatureProfile": {
      "energy": 0.72,
      "valence": 0.61,
      "danceability": 0.68,
      "acousticness": 0.18,
      "instrumentalness": 0.14
    },
    "topArtists": [{ "name": "Bon Iver", "genres": ["indie", "folk"] }],
    "derivedAt": "2026-02-25T18:00:00.000Z"
  },
  "pushedAt": "2026-02-25T18:00:00.000Z"
}
```

Once derived, the signal is readable via Pattern 2: `GET /api/signals/spotify-taste`. Re-call this endpoint to refresh (e.g. weekly or on user request).

---

## Connect flow (user-scoped integration access)

Apps can request access to a specific user's Threshold-connected integration data via the connect flow.

**Flow:**
1. Redirect the user to `https://thresholdlabs.io/connect?app_id=YOUR_SLUG&source=SOURCE&redirect_uri=YOUR_REDIRECT`
2. The user reviews the request and approves
3. Threshold redirects back to your `redirect_uri` with `?thld_token=thld_ct_...`
4. Use the `thld_ct_` connect token for that user's integration reads

Connect tokens are scoped per-user per-source. Revocation: users manage grants at [thresholdlabs.io/settings](https://thresholdlabs.io/settings).

---

## Error contract

All errors return `{ "error": string }` with an appropriate HTTP status:

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid or missing token | Check token, don't retry |
| 403 | Token valid but wrong app/scope | Check slug matches token's app |
| 404 | Resource not found | Check slug is registered |
| 422 | Malformed payload | Fix payload, don't retry |
| 429 | Rate limited | Back off, check Retry-After header |
| 503 | Temporarily unavailable | Retry with exponential backoff |

Network failures and CORS errors won't have this shape — catch them separately.
Signal push failures should always be silent to end users.

---

## Rate limits

No hard rate limits enforced today. Recommended cadences:
- Signal push: at most once per minute per user
- Graph signature: on state change, debounced to once per 60s

Limits will be added before public launch. Filing issues with your app's expected volume helps us calibrate.

---

## Filing issues

Found a gap in the interface? [Open an issue](https://github.com/Threshold-Labs/threshold-sdk/issues) using the format in `CLAUDE.md`.

Full integration docs: [thresholdlabs.io/developers](https://thresholdlabs.io/developers)
Auditor prompt: [thresholdlabs.io/api/prompts/audit](https://thresholdlabs.io/api/prompts/audit)
