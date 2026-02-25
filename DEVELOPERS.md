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

All external integration endpoints use your app token:

```
Authorization: Bearer thld_your_token_here
```

App tokens identify your app and its owner. They don't expire unless revoked.
Revoke and reissue from the Ecosystem dashboard.

## CORS

All endpoints support CORS with `Access-Control-Allow-Origin: *`.
**Browser apps can call the API directly — no server-side proxy required.**

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

## Error contract

All errors return `{ "error": string }` with an appropriate HTTP status:

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid or missing app token | Check token, don't retry |
| 403 | Token valid but wrong app/scope | Check slug matches token's app |
| 404 | Resource not found | Check slug is registered |
| 422 | Malformed payload | Fix payload, don't retry |
| 429 | Rate limited | Back off, check Retry-After header |
| 503 | Temporarily unavailable | Retry with exponential backoff |

Network failures and CORS errors won't have this shape — catch them separately.

## connectTokens (user-scoped integration access)

A `thld_ct_` token lets your app read a specific user's integration data held by Threshold (e.g. their Spotify connection).

**Flow:**
1. User authenticates with Threshold (they must have an account)
2. User enables your app's access to a source: `POST /api/integrations/grants` (Clerk JWT required)
3. Threshold generates a connectToken: `POST /api/integrations/grants/:appId/:source/connect-token`
4. User pastes the token into your app, or your app receives it via redirect

**Using a connectToken:**
```
Authorization: Bearer thld_ct_...
```

Tokens are long-lived. Revocation: users manage grants at [thresholdlabs.io/settings](https://thresholdlabs.io/settings).

A consent UI and redirect flow for this is on the roadmap (see issue #6). For now the token is copied manually.

## Rate limits

No hard rate limits enforced today. Recommended cadences:
- Signal push: at most once per minute per user
- Graph signature: on state change, debounced to once per 60s

Limits will be added before public launch. Filing issues with your app's expected volume helps us calibrate.

## Filing issues

Found a gap in the interface? [Open an issue](https://github.com/Threshold-Labs/threshold-sdk/issues) using the format in `CLAUDE.md`.

Full integration docs: [thresholdlabs.io/developers](https://thresholdlabs.io/developers)
Auditor prompt: [thresholdlabs.io/api/prompts/audit](https://thresholdlabs.io/api/prompts/audit)
