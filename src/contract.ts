/**
 * Threshold Capability Contract
 *
 * Single source of truth for the Threshold external integration surface.
 * Import this in docs, the /developers page, and any tooling that validates
 * integration payloads.
 *
 * v0.7.0: Capabilities replace integrations as the primary trust entity.
 * Everything is a capability — connectors, signals, vaults, derivations.
 * Users own capabilities. Apps compose them. Trust is per-capability.
 *
 * This file lives in @threshold-labs/integration — a public repo.
 * External apps file issues here when the interface needs to change.
 * https://github.com/Threshold-Labs/threshold-sdk
 */

// ── Capability Types ─────────────────────────────────────────────────────────

/** Capability type — what kind of trust primitive this is */
export type CapabilityType = 'signal' | 'connector' | 'graph' | 'embedding' | 'vault' | 'derivation' | 'presentation'

/** Trust level — how much data flows through this capability */
export type TrustLevel = 'metadata-only' | 'redacted' | 'partial' | 'full' | 'subgraph'

/** Minimum trust required to access this capability */
export type MinimumTrust = 'acquaintance' | 'colleague' | 'client' | 'friend' | 'close' | 'partner'

/** Capability reliability — operational status */
export type CapabilityReliability = 'healthy' | 'degraded' | 'blocked'

/** Capability status */
export type CapabilityStatus = 'active' | 'paused' | 'revoked'

/**
 * Capability declaration — behavioral trust contract on an app, user, or module.
 * Accepted per RFC #28 (capabilities) + #33 (coverage declaration) + #11 (trusted connector).
 *
 * v0.7.0: Added ownership, composition, reliability, and endpoint fields.
 * A capability is the primary trust entity in Threshold. Users own capabilities.
 * Apps declare which capabilities they need. Trust is per-capability.
 */
export interface CapabilityDeclaration {
  id: string                           // unique within owner, e.g. 'focus-tracking'
  name: string                         // human-readable
  description: string
  type?: CapabilityType
  canonicalFor?: string                // if type='connector': the external source (e.g. 'spotify')

  // Ownership — who provides this capability
  ownerType?: 'user' | 'app'          // user-owned (e.g. "my Spotify") or app-provided (e.g. Threshold derivation)

  // Composition — capabilities can be composed
  composedOf?: string[]                // child capability IDs this depends on
  requiredCapabilities?: string[]      // capabilities that must exist before this one works

  // Dimension 1: Trust profile
  trustLevel: TrustLevel
  minimumTrust: MinimumTrust

  // Dimension 2: Cadence contract (declared by app; adherence computed by Threshold)
  cadence?: {
    expected: string                   // ISO 8601 duration, 'on-demand', or 'continuous'
    window?: string                    // grace window before miss is counted, ISO 8601 duration
    gatedBy?: string[]                 // conditions: ['app-running', 'user-active', 'project-active']
  }

  // Dimension 3: Adherence (computed by Threshold, not declared — included here for type completeness)
  adherenceScore?: number              // 0–100, Threshold-computed from cadence history
  adherenceTrend?: 'improving' | 'stable' | 'degrading'

  // Operational state
  reliability?: CapabilityReliability  // healthy | degraded | blocked
  endpoint?: string                    // vault URL, token endpoint, or API base for this capability

  // Source coverage (for connector-type capabilities — RFC #33)
  sources?: Array<{
    id: string                         // e.g. 'costco', 'king-soopers'
    method: string                     // 'kroger-api' | 'scraped' | 'graphql' | 'webhook' | etc.
    coverage: 'full' | 'partial' | 'none'
    region?: string                    // 'front-range-co' | 'us-west' | 'global'
    note?: string                      // 'new/seasonal items only, no promotions'
    reason?: string                    // for coverage:none — 'external-block' | 'auth-expired' | 'deprecated'
  }>
}

/**
 * Auth tier — the three levels of identity in a Threshold app.
 * Every Threshold app MUST work at the ephemeral tier.
 * Auth upgrades experience (portability, cross-app) — it never gates core functionality.
 */
export type AuthTier = 'ephemeral' | 'device' | 'authenticated'

/**
 * Scope — a named group of users with shared signal access.
 * First-class trust entity alongside user and app.
 *
 * Scope IDs use a namespaced slug: household:abc123, org:acme, project:sideslip
 * Membership is the implicit grant for reading scope-scoped signals.
 * No pairwise user→user grants needed for group contexts.
 *
 * RFC #34 (grocery-finder, shared contexts)
 */
export interface ScopeDeclaration {
  id: string                    // e.g. 'household:abc123', 'org:acme'
  name: string                  // human-readable
  type: 'household' | 'org' | 'project' | 'custom'
  members?: string[]            // user IDs (informational; authoritative list is server-side)
}

/**
 * Grant — explicit trust delegation between users or to a scope.
 * Two types share the same structure with a type discriminator.
 *
 * user grants: User A shares specific signal sources with User B directly.
 * scope grants: Any scope member can read scope-scoped signals from listed sources.
 *
 * Membership in the scope is the implicit grant — no pairwise grants needed.
 */
export interface GrantDeclaration {
  type: 'user' | 'scope'
  grantee: string               // userId (type:'user') or scopeId (type:'scope')
  sources: string[]             // which signal sources are shared
  trustLevel: 'metadata-only' | 'aggregate' | 'partial' | 'full'
  expiresAt?: string | null     // ISO 8601 or null for non-expiring
}

// ── Capability Requests ─────────────────────────────────────────────────────

/**
 * Capability request — demand-side signal for the capability model.
 * Expresses a typed need for a capability, with trust metadata on the request itself.
 *
 * Trust flows in both directions:
 * - Requester trusts that the fulfiller will deliver at the declared trust level
 * - Fulfiller trusts that the need is real and worth serving
 * - Fulfillment quality feeds back as attribution/correction data
 *
 * RFC #47
 */
export interface CapabilityRequest {
  /** Unique request ID */
  id: string
  /** Who is requesting — user ID, app slug, or agent ID */
  requesterId: string
  /** What type of entity is requesting */
  requesterType: 'user' | 'app' | 'agent'
  /** Human-readable description of the needed capability */
  description: string
  /** What type of capability is being requested */
  capabilityType?: CapabilityType
  /** Trust level the requester is willing to operate at */
  trustLevelOffered: TrustLevel
  /** Why the requester needs this capability */
  purpose: string
  /** Specific capability ID being requested, if targeting an existing capability */
  targetCapabilityId?: string
  /** Who the requester wants to fulfill the request, if known */
  targetFulfillerId?: string
  /** Current status of the request */
  status: 'open' | 'matched' | 'fulfilled' | 'withdrawn'
  /** ISO 8601 timestamp of when the request was created */
  createdAt: string
  /** ISO 8601 expiry, or null for non-expiring */
  expiresAt?: string | null
}

// ── Trust Records ────────────────────────────────────────────────────────────

/**
 * Attribution claim — an app claims credit for a user action or outcome.
 * Stored in the trust graph; used for provenance tracking and reputation.
 * Append-only — claims are never deleted.
 *
 * RFC #40
 */
export interface AttributionClaim {
  /** Claiming app's slug */
  appSlug: string
  /** What the app is claiming credit for */
  action: string
  /** The entity (user, content, etc.) the claim is about */
  subjectId: string
  /** How confident the app is in the claim (0–1) */
  confidence: number
  /** Supporting evidence (app-defined JSON) */
  evidence?: Record<string, unknown>
  /** ISO 8601 timestamp of the claimed action */
  occurredAt: string
}

/**
 * Correction — an app or user corrects a previously published signal or claim.
 * Creates an append-only audit trail; the original is never deleted.
 *
 * RFC #41
 */
export interface Correction {
  /** What is being corrected: 'signal' | 'attribution' | 'capability' */
  targetType: 'signal' | 'attribution' | 'capability'
  /** ID of the original record */
  targetId: string
  /** Who is issuing the correction */
  correctorId: string
  /** Why the correction is being made */
  reason: string
  /** The corrected payload (replaces the original for consumers) */
  correctedPayload: Record<string, unknown>
  /** ISO 8601 timestamp */
  correctedAt: string
}

/**
 * Resolved capability — returned by resolveCapability().
 * Contains everything an app needs to communicate with a capability at runtime.
 */
export interface ResolvedCapability {
  /** The capability's registered endpoint URL, or null if not set */
  endpoint: string | null
  /** Effective trust level for the caller (from grant, composition, or 'full' for owner) */
  trustLevel: TrustLevel
  /** Current operational status */
  status: CapabilityStatus
  /** Reliability indicator */
  reliability: CapabilityReliability
  /** Full behavioral contract (if registered) */
  declaration: CapabilityDeclaration | null
}

/**
 * Data access result — returned by requestDataAccess().
 * Contains endpoint + signed credential for direct capability-to-capability data flow.
 */
export interface DataAccessResult {
  /** The capability endpoint to call with the credential */
  endpoint: string
  /** thld_va_ prefixed JWT — present as Bearer token to the capability endpoint */
  credential: string
  /** The trust level encoded in the credential — capability uses this to filter response */
  trustLevel: TrustLevel
  /** Capability slug (matches the credential's aud claim) */
  capabilityId: string
  /** ISO 8601 credential expiry */
  expiresAt: string
}

/**
 * Data credential payload — decoded from the thld_va_ JWT issued by /data endpoint.
 * Capabilities verify this locally using verifyDataCredential().
 *
 * Extends the vault credential pattern with trust_level and owner_id claims
 * for trust-scoped data filtering.
 */
export interface DataCredentialPayload {
  /** Who is requesting the data (e.g. "app:uuid" or "user:uuid") */
  grantee: string
  /** Capability slug this credential is scoped to — verifier checks this matches */
  audience: string
  /** Trust level — determines what data the capability should return */
  trustLevel: TrustLevel
  /** The grant or composition that authorized this credential */
  grantId: string
  /** The capability owner's user ID — whose data is being accessed */
  ownerId: string
  /** When this credential expires */
  expiresAt: Date
}

// ── Capability Contract ──────────────────────────────────────────────────────

export const CAPABILITY_CONTRACT = {
  version: '0.8.0',
  baseUrl: 'https://thresholdlabs.io',

  auth: {
    appToken: {
      prefix: 'thld_',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Issued per-app from the Ecosystem dashboard at /ecosystem. Identifies the app and its owner. Register at https://thresholdlabs.io/ecosystem.',
    },
    clerkJwt: {
      header: 'Authorization',
      format: 'Bearer <clerk-jwt>',
      note: 'Issued to logged-in Threshold users. Used for dashboard API calls.',
    },
    capabilityGrantToken: {
      prefix: 'thld_cg_',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Scoped per-capability grant token. Generated when a user grants access to a specific capability for an app. Replaces connect tokens (thld_ct_).',
    },
    userToken: {
      prefix: 'thld_ut_',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Issued after Login with Threshold. Scoped per-app per-user. Used for user-scoped API calls (signals, storage, capabilities). Stored client-side in localStorage.',
    },
    /** @deprecated Use capabilityGrantToken instead */
    connectToken: {
      prefix: 'thld_ct_',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Deprecated — use capabilityGrantToken (thld_cg_). Legacy scoped per-user token allowing an app to read a specific integration.',
    },
  },

  /**
   * Auth Tiers — Ephemeral-First Contract
   *
   * Every Threshold app MUST work at the ephemeral tier. Auth is opt-in,
   * never required. The value of auth is portability and cross-app intelligence,
   * not access.
   *
   * Rules:
   * 1. Every Threshold app MUST work at the Ephemeral tier
   * 2. "Login with Threshold" upgrades to Authenticated — it never gates core functionality
   * 3. Device-linked is intermediate — cross-session continuity without auth
   * 4. Logging out returns to Ephemeral, not a broken state
   */
  tiers: {
    ephemeral: {
      identity: 'none',
      storage: 'localStorage only',
      signals: 'App-scoped push only (app token)',
      note: 'Full app functionality, device-local. No user identity required.',
    },
    device: {
      identity: 'crypto.randomUUID() in localStorage',
      storage: 'localStorage + device ID header',
      signals: 'App-scoped with device correlation',
      note: 'Cross-session continuity on same device. No Threshold account needed.',
    },
    authenticated: {
      identity: 'Threshold user token (thld_ut_)',
      storage: 'Threshold-managed (user-scoped signals)',
      signals: 'User-scoped push/read',
      note: 'Cross-device, portable, sharable. Full trust graph participation.',
    },
  },

  /**
   * Login with Threshold — OAuth flow for external apps
   *
   * Clerk is the identity backend (never exposed to apps).
   * Threshold is the authorization layer (issues its own tokens).
   *
   * Flow:
   * 1. App redirects to /auth/authorize?app_id=...&redirect_uri=...
   * 2. User authenticates via Clerk (existing ClerkProvider)
   * 3. Threshold issues an authorization code
   * 4. App exchanges code for a Threshold user token (thld_ut_)
   * 5. App uses token for user-scoped API calls
   */
  login: {
    authorize: {
      page: '/auth/authorize',
      description: 'Consent page for Login with Threshold. App redirects the user here. After user approves, redirects back to redirect_uri with an authorization code.',
      queryParams: {
        app_id: 'string — registered app ID',
        redirect_uri: 'string — where to send the auth code (must be registered)',
        scope: 'string? — space-separated scopes (default: "profile signals")',
        state: 'string? — opaque value passed back to redirect_uri for CSRF protection',
      },
      result: 'Redirect to redirect_uri?code=...&state=...',
    },
    appInfo: {
      endpoint: '/api/auth/app-info',
      method: 'GET' as const,
      auth: 'none' as const,
      description: 'Public lookup for consent page. Returns app name and whether redirect_uri is allowed.',
      queryParams: {
        app_id: 'string — registered app ID',
        redirect_uri: 'string? — URI to validate against allowed list',
      },
      response: {
        id: 'string',
        name: 'string',
        slug: 'string',
        iconUrl: 'string | null',
        redirectAllowed: 'boolean',
      },
    },
    code: {
      endpoint: '/api/auth/code',
      method: 'POST' as const,
      auth: 'clerkJwt' as const,
      description: 'Issue an authorization code after user approves on the consent page.',
      body: {
        app_id: 'string — registered app ID',
        redirect_uri: 'string — must match the original and be in allowed list',
        scope: 'string? — space-separated scopes (default: "profile signals")',
        state: 'string? — opaque value (passed through, not stored)',
      },
      response: {
        code: 'string — authorization code (5 minute TTL)',
      },
    },
    token: {
      endpoint: '/auth/token',
      method: 'POST' as const,
      auth: 'appToken' as const,
      description: 'Exchange an authorization code for a Threshold user token.',
      body: {
        code: 'string — the authorization code from the redirect',
        redirect_uri: 'string — must match the original redirect_uri',
      },
      response: {
        token: 'string — thld_ut_ prefixed user token',
        userId: 'string — Threshold user ID (opaque)',
        expiresAt: 'string | null — ISO 8601, null for non-expiring',
        scopes: 'string[] — granted scopes',
      },
    },
    userinfo: {
      endpoint: '/auth/userinfo',
      method: 'GET' as const,
      auth: 'userToken' as const,
      description: 'Get user profile. Scoped to what the app is allowed to see.',
      response: {
        userId: 'string — Threshold user ID',
        displayName: 'string | null',
        imageUrl: 'string | null',
        tier: '"authenticated"',
      },
    },
    logout: {
      endpoint: '/auth/logout',
      method: 'POST' as const,
      auth: 'userToken' as const,
      description: 'Revoke user token. App should clear localStorage.',
    },
  },

  cors: {
    allowOrigin: '*',
    allowMethods: 'GET, POST, PATCH, DELETE, OPTIONS',
    allowHeaders: 'Authorization, Content-Type, X-App-Token',
    note: 'All endpoints support CORS. Browser apps can call the API directly — no server-side proxy required.',
  },

  errors: {
    401: 'Invalid or expired token. Check that your app token starts with thld_ and has not been revoked.',
    403: 'Token is valid but not authorized for this operation (e.g. app token does not match the app slug).',
    404: 'Resource not found. For signal push: source slug is valid but app not found. For signature: slug not registered.',
    422: 'Malformed payload. Check that the request body is valid JSON and Content-Type is application/json.',
    429: 'Rate limited. Back off and retry — check Retry-After header if present.',
    503: 'Threshold temporarily unavailable. Safe to retry with exponential backoff. Do not alert users.',
    note: 'All errors return JSON: { error: string }. Network failures and CORS errors will not have this shape — handle them separately. Signal push failures should always be silent to the end user.',
  },

  // ── Capability CRUD ──────────────────────────────────────────────────────
  capabilities: {
    create: {
      endpoint: '/api/capabilities',
      method: 'POST' as const,
      auth: 'clerkJwt' as const,
      description: 'Declare a capability owned by the authenticated user. For connector types (e.g. Spotify), this is called after the OAuth flow completes.',
      body: {
        capabilityId: 'string — slug unique to the user, e.g. "spotify-connector"',
        name: 'string — human-readable name',
        type: '"signal" | "connector" | "graph" | "embedding" | "vault" | "derivation"',
        canonicalFor: 'string? — for connectors: "spotify", "gmail", etc.',
        trustLevel: '"metadata-only" | "redacted" | "partial" | "full" | "subgraph"',
        minimumTrust: '"acquaintance" | "colleague" | "client" | "friend" | "close" | "partner"',
        endpoint: 'string? — vault URL or data endpoint',
        declaration: 'CapabilityDeclaration? — full behavioral contract (stored as JSON)',
      },
      response: { id: 'string', capabilityId: 'string', createdAt: 'string' },
    },
    list: {
      endpoint: '/api/capabilities',
      method: 'GET' as const,
      auth: 'clerkJwt' as const,
      description: 'List all capabilities owned by the authenticated user.',
      response: 'Array<Capability>',
    },
    get: {
      endpoint: '/api/capabilities/:id',
      method: 'GET' as const,
      auth: 'clerkJwt' as const,
      description: 'Get details for a specific capability.',
      response: 'Capability',
    },
    update: {
      endpoint: '/api/capabilities/:id',
      method: 'PATCH' as const,
      auth: 'clerkJwt' as const,
      description: 'Update a capability. Only the owner can update.',
      body: 'Partial<Capability> — any mutable fields',
    },
    revoke: {
      endpoint: '/api/capabilities/:id',
      method: 'DELETE' as const,
      auth: 'clerkJwt' as const,
      description: 'Revoke a capability. Sets status to "revoked". All active grants are invalidated.',
    },
  },

  // ── Capability Grants ────────────────────────────────────────────────────
  capabilityGrants: {
    create: {
      endpoint: '/api/capabilities/:id/grants',
      method: 'POST' as const,
      auth: 'clerkJwt' as const,
      description: 'Grant access to a capability. The authenticated user must own the capability.',
      body: {
        granteeType: '"user" | "app" | "scope"',
        granteeId: 'string — user_id, app_id, or scope_id',
        trustLevel: '"metadata-only" | "aggregate" | "partial" | "full"',
        expiresAt: 'string? — ISO 8601 or null for non-expiring',
      },
      response: { id: 'string', token: 'string? — thld_cg_ token returned once for app grantees' },
    },
    list: {
      endpoint: '/api/capabilities/:id/grants',
      method: 'GET' as const,
      auth: 'clerkJwt' as const,
      description: 'List active grants on a capability. Owner only.',
      response: 'Array<{ id, granteeType, granteeId, trustLevel, createdAt, expiresAt, lastUsedAt }>',
    },
    revoke: {
      endpoint: '/api/capabilities/:id/grants/:grantId',
      method: 'DELETE' as const,
      auth: 'clerkJwt' as const,
      description: 'Revoke a specific grant.',
    },
  },

  // ── Capability Compositions ──────────────────────────────────────────────
  compositions: {
    list: {
      endpoint: '/api/apps/:slug/capabilities',
      method: 'GET' as const,
      auth: ['appToken', 'clerkJwt'] as const,
      description: 'List capabilities an app composes (requires). Public metadata only.',
      response: 'Array<{ capabilityId, name, type, required, role }>',
    },
    add: {
      endpoint: '/api/apps/:slug/capabilities',
      method: 'POST' as const,
      auth: 'clerkJwt' as const,
      description: 'Add a capability requirement to an app. App owner only.',
      body: {
        capabilityId: 'string — ID of the capability to compose',
        required: 'boolean? — whether this capability is required (default: true)',
        role: 'string? — what role this capability plays in the app',
      },
    },
    remove: {
      endpoint: '/api/apps/:slug/capabilities/:capId',
      method: 'DELETE' as const,
      auth: 'clerkJwt' as const,
      description: 'Remove a capability from an app composition.',
    },
  },

  // ── Capability Resolution (Pattern 6a — #52) ────────────────────────────
  capabilityResolution: {
    resolve: {
      endpoint: '/api/capabilities/:id/resolve',
      method: 'GET' as const,
      auth: ['grantToken', 'appToken', 'clerkJwt'] as const,
      description: 'Runtime discovery of a capability endpoint. Returns endpoint URL, trust level, operational status, and full declaration. Grant token holders get the trust level from their grant. App token holders (via composition) get the capability\'s declared trust level. Clerk JWT holders (owner) get full trust.',
      response: {
        endpoint: 'string | null — the capability\'s registered endpoint URL',
        trustLevel: '"metadata-only" | "redacted" | "partial" | "full" | "subgraph" — effective trust level for the caller',
        status: '"active" | "paused" | "revoked"',
        reliability: '"healthy" | "degraded" | "blocked"',
        declaration: 'CapabilityDeclaration | null — full behavioral contract',
      },
    },
  },

  // ── Capability Data Access (Pattern 6b — #53) ─────────────────────────
  capabilityDataAccess: {
    requestAccess: {
      endpoint: '/api/capabilities/:id/data',
      method: 'POST' as const,
      auth: ['grantToken', 'appToken'] as const,
      description: 'Request a trust-scoped data access credential for direct capability-to-capability communication. Returns the capability endpoint + a signed credential (thld_va_ JWT). The caller presents this credential directly to the capability endpoint. Threshold stays out of the data path. The credential includes trust_level, so the capability can filter its response accordingly.',
      response: {
        endpoint: 'string — the capability endpoint to call with the credential',
        credential: 'string — thld_va_ prefixed JWT, present as Bearer token to the capability',
        trustLevel: 'string — the trust level encoded in the credential',
        capabilityId: 'string — the capability slug (matches credential aud claim)',
        expiresAt: 'string — ISO 8601, credential expiry (15 min TTL)',
      },
      note: 'Hybrid approach: Threshold handles auth + trust resolution, but data flows directly between apps. Capabilities verify the credential locally using verifyDataCredential() from the SDK.',
    },
  },

  // ── Signal Subscription (TODO) ────────────────────────────────────────────
  // Gap: apps need to subscribe to signals emitted by composed capabilities.
  // Pattern 2 (signal read) is polling-only. No push/webhook forwarding pattern.
  // Needed for: payment signals (stripe-payment → app), capability lifecycle events.
  // Tracked in: threshold-capabilities/ROADMAP.md

  // ── Signal Patterns (unchanged) ──────────────────────────────────────────
  patterns: {
    /**
     * Pattern 1: Signal Push
     *
     * External apps compute a derived signal locally and push it to Threshold.
     * Raw data stays on the app — only the heuristic is transmitted.
     * Auth: app token
     *
     * Source registration: the :source slug is self-declared — no registration
     * step required. Use your app slug (e.g. "project-control", "ai-dj").
     * Adding a new source to knownSources below is documentation, not enforcement.
     *
     * Payload: free-form JSON object. One row per user per source — each push
     * overwrites the previous value. Batch multiple heuristics in one call.
     */
    signalPush: {
      endpoint: '/api/signals/:source',
      method: 'POST' as const,
      auth: 'appToken' as const,
      description:
        'Push a derived heuristic signal to Threshold. The source is your app slug. The body is free-form JSON — batch all heuristics for a cycle into one call. One row per user per source; each push overwrites the previous.',
      knownSources: {
        'project-control': {
          description: 'Developer focus and attention data from project-control',
          schema: {
            activeProject: 'string — current project slug (client work sanitized to "client work")',
            focusScore: 'number 0–100 — computed from switch rate and deep work blocks',
            driftDetected: 'boolean — true if project changed since last push',
            label: 'string — human-readable label for the signal',
            pushedAt: 'string — ISO 8601 timestamp',
          },
        },
        'ai-dj': {
          description: 'Attention and music state from FlowDJ — cognitive rhythm mapped to generative audio',
          schema: {
            // Attention signals
            flowScore: 'number 0–100 — typing/voice momentum score with exponential decay',
            zone: '"idle" | "warming" | "flow" | "peak" — current flow zone',
            wpm: 'number — words per minute (10s rolling window)',
            voiceEnergy: 'number 0–1 — mic RMS level, normalized',
            // Focus signals (present when a project is active)
            activeProject: 'string | null — project slug (e.g. "sideslip", "dropin")',
            focusScore: 'number 0–100 | null — on-topic score for active project',
            focusState: '"on-task" | "focused" | "drifting" | "off-topic" | null',
            // Music state
            activeVibe: 'string — current vibe preset (e.g. "focus", "jazz", "dark")',
            musicParams: '{ energy: number, complexity: number, warmth: number, space: number, bpm: number }',
            pushedAt: 'string — ISO 8601',
          },
        },
      },
      response: {
        ok: 'boolean',
        pushedAt: 'string — ISO 8601 timestamp of when the signal was stored',
      },
    },

    /**
     * Pattern 2: Signal Read
     *
     * Read the latest signal for the authenticated user from any source.
     * Auth: app token (token owner = the user) or Clerk JWT.
     *
     * Trust scope (v0.3): user-scoped self-read only.
     * You can read any signal pushed for your own user — regardless of which app pushed it.
     * Cross-user reads (user A reads user B's signals) require explicit user grants.
     * That trust layer is the next iteration — file issues to shape it.
     *
     * Common use cases today:
     * - App reads its own previously pushed signals (self-read, app token)
     * - Dashboard reads any signal for the logged-in user (Clerk JWT)
     * - CLI/daemon reads signals without a browser auth flow (app token)
     */
    signalRead: {
      endpoint: '/api/signals/:source',
      method: 'GET' as const,
      auth: ['appToken', 'clerkJwt'] as const,
      description: 'Read the latest signal for the authenticated user. App token returns the signal for the token owner. Clerk JWT returns the signal for the logged-in user. Cross-user reads (trust graph) coming in the next iteration.',
      response: {
        source: 'string — the source slug',
        signal: 'object — the signal data as originally pushed',
        pushedAt: 'string — ISO 8601 timestamp of the last push',
      },
      freshness: {
        contract: 'pushedAt is informational — the server does not enforce a TTL on stored signals.',
        consumerResponsibility: 'Consumers define their own staleness threshold. Recommended defaults: 5min for real-time (music, focus), 30min for dashboards, 24h for analytics.',
        pattern: 'if (Date.now() - new Date(pushedAt).getTime() > YOUR_THRESHOLD_MS) return;',
        note: 'project-control pushes on each attention scan cycle. ai-dj treats signals older than 5min as stale and disables cross-app mapping until a fresh push arrives.',
      },
      crossAppReads: {
        status: 'live' as const,
        note: 'Any app token for user X can read any signal pushed for user X from any source — no explicit grant required. The user is the implicit grant. Grants are only needed for cross-USER reads (user A reading user B\'s signals).',
      },
      crossUserReads: {
        status: 'coming-soon' as const,
        note: 'User A reading user B\'s signals requires explicit grants between users. File issues at https://github.com/Threshold-Labs/threshold-sdk to shape this.',
      },
    },

    /**
     * Pattern 3: Graph Embedding Telemetry
     *
     * Apps using @threshold-labs/core to compute structural signatures send
     * those signatures to Threshold. Threshold stores history, detects drift,
     * and (with user permission) enables cross-app structural comparison.
     * Auth: app token or Clerk JWT
     *
     * viewName: scoped to your app by the route slug — no need to prefix.
     * Cadence: push on meaningful state change (e.g. graph-discover run), not continuously.
     * Recommended debounce: skip if last push was <60s ago.
     */
    graphSignature: {
      endpoint: '/api/apps/:slug/signature',
      methods: ['GET', 'POST'] as const,
      auth: ['appToken', 'clerkJwt'] as const,
      description:
        'Sync a structural signature computed by @threshold-labs/core. The slug must match an app registered in your Threshold dashboard. viewName is scoped to your app — no prefix needed.',
      package: '@threshold-labs/core',
      provenance: ['connected', 'anonymous', 'projection'] as const,
      push: {
        body: {
          viewName: 'string — identifies the graph view (e.g. "current", "target", "filtered")',
          signature: 'StructuralSignature — output of computeSignature() from @threshold-labs/core',
        },
        response: { ok: 'boolean' },
      },
      read: {
        response: {
          slug: 'string',
          views: 'Array<{ viewName, signature: StructuralSignature, lastSync: string }>',
        },
        note: 'Self-read (token owner == app owner) always allowed. Cross-app reads require an app_data_grant — see issue #20.',
      },
      history: {
        endpoint: '/api/apps/:slug/signature/history',
        queryParams: {
          viewName: 'string — which view to retrieve (default: "main")',
          limit: 'number — max snapshots to return (default: 50, max: 200)',
        },
        response: {
          slug: 'string',
          viewName: 'string',
          history: 'Array<{ signature: StructuralSignature, computedAt: string }>',
        },
        note: 'Ordered newest-first. Use for drift visualization.',
      },
    },
  },

  /**
   * Pattern 4: Vault
   *
   * Apps register a vault endpoint and declare capabilities. Other apps
   * request a short-lived signed credential from Threshold and present it
   * directly to the vault — Threshold is never in the data path.
   *
   * TTL: 15 minutes (900 seconds). The response includes `expiresAt` as ISO 8601.
   * Recommended: cache the credential and refresh 60s before expiry.
   */
  vault: {
    register: {
      endpoint: '/api/apps/:slug/vault',
      method: 'POST' as const,
      auth: 'clerkJwt' as const,
      body: {
        endpoint: 'string — the URL of your vault server (e.g. http://localhost:9111/vault)',
        capabilities: 'Array<CapabilityDeclaration | { scope: string, description: string }> — use CapabilityDeclaration for full behavioral contracts',
      },
    },
    capabilities: {
      read: {
        endpoint: '/api/apps/:slug/vault/capabilities',
        method: 'GET' as const,
        auth: 'none' as const,
        description: 'Public — no auth required. Returns the vault endpoint and full capability declarations.',
        response: {
          slug: 'string',
          endpoint: 'string — vault base URL',
          capabilities: 'Array<CapabilityDeclaration> — full behavioral contracts as registered',
        },
      },
      update: {
        endpoint: '/api/apps/:slug/vault/capabilities',
        method: 'PUT' as const,
        auth: ['appToken', 'clerkJwt'] as const,
        description: 'Update capability declarations without changing the vault endpoint. Designed for daemon processes that push updated adherence scores on startup. Requires vault to be registered first via POST /api/apps/:slug/vault.',
        body: {
          capabilities: 'Array<CapabilityDeclaration> — full behavioral contracts',
        },
        response: { ok: 'boolean', slug: 'string', capabilityCount: 'number' },
      },
    },
    credential: {
      endpoint: '/api/apps/:slug/vault/credential',
      method: 'POST' as const,
      auth: 'appToken' as const,
      description: 'Request a signed vault credential. Requires an app_data_grant for the requested scope on the target vault.',
      body: {
        scope: 'string — must match a declared vault capability, e.g. "edges:read:current"',
      },
      response: {
        credential: 'string — thld_va_ prefixed JWT. ES256, P-256. Present to the vault as Authorization: Bearer.',
        vaultEndpoint: 'string — the registered vault URL to present the credential to',
        expiresAt: 'string — ISO 8601. Credential is valid until this time. Cache and refresh 60s before expiry.',
      },
      ttl: '15 minutes (900 seconds)',
      note: 'The credential is verified locally by the vault using verifyVaultCredential() from @threshold-labs/integration/vault. No callback to Threshold is required at verification time.',
    },
    jwks: {
      endpoint: '/.well-known/jwks.json',
      method: 'GET' as const,
      auth: 'none' as const,
      description: 'Public key for vault credential verification. ECDSA P-256, kid: vault-signing-1. Cache this; it rotates infrequently.',
    },
    grantScopes: {
      note: 'Vault scopes are dynamically validated against the vault\'s declared capabilities. Any scope in the registered capabilities array is a valid grant scope. Create grants via POST /api/apps/:slug/grants in the Ecosystem UI.',
    },
  },

  /**
   * Threshold-side Derivations
   *
   * Derivations are first-party capabilities (ownerType: 'app', ownerId: 'threshold').
   * They compose a user's connector capability (e.g. Spotify) and produce a signal.
   * Same trust model as any other capability — same UI, same revocation.
   */
  derivations: {
    spotifyTaste: {
      endpoint: '/api/integrations/derive/spotify-taste',
      method: 'POST' as const,
      auth: ['appToken', 'clerkJwt'] as const,
      description: 'Derives SpotifyTasteSignal from the user\'s connected Spotify account (top artists, top tracks, audio features) and pushes it as a "spotify-taste" signal. Returns the derived signal immediately. Requires Spotify capability at /capabilities.',
      response: {
        source: '"spotify-taste"',
        signal: 'SpotifyTasteSignal',
        pushedAt: 'string — ISO 8601',
      },
      signalSchema: {
        topGenres: 'string[] — rank-ordered genre list (e.g. ["indie", "electronic", "jazz"])',
        audioFeatureProfile: {
          energy: 'number 0–1',
          valence: 'number 0–1 (sad → happy)',
          danceability: 'number 0–1',
          acousticness: 'number 0–1',
          instrumentalness: 'number 0–1',
        },
        topArtists: 'Array<{ name: string, genres: string[] }> — top 10',
        derivedAt: 'string — ISO 8601',
      },
      note: 'Once derived, the signal is readable via Pattern 2: GET /api/signals/spotify-taste. Re-call this endpoint to refresh (e.g. weekly or on user request).',
    },
  },

  /**
   * Pattern 5: Shared Contexts (Scopes)
   *
   * A scope is a named group of users. Signals can be scoped to a scope instead
   * of a user. Any scope member can read scope-scoped signals without pairwise grants.
   *
   * Scope IDs: namespaced slugs — household:abc123, org:acme, project:sideslip
   * The scope type is informational; Threshold treats all scopes identically.
   *
   * Signal push with scope:
   *   POST /api/signals/:source?scope=household:abc123
   *   Writes to scope_signals table (scope_id, source) instead of user_signals
   *
   * Signal read with scope:
   *   GET /api/signals/:source?scope=household:abc123
   *   Auth: app token whose owner is a member of the scope
   *
   * Privacy model: individual signals stay user-scoped (private); derived/shared
   * signals are scope-scoped. Apps derive from individual preferences locally,
   * then push the derivation to the scope — raw preferences never shared.
   *
   * RFC #34 (grocery-finder, shared contexts)
   */
  sharedContexts: {
    status: 'live' as const,
    scope: {
      create: {
        endpoint: '/api/scopes',
        method: 'POST' as const,
        auth: 'clerkJwt' as const,
        body: {
          id: 'string — namespaced slug, e.g. "household:abc123"',
          name: 'string — human-readable',
          type: '"household" | "org" | "project" | "custom"',
        },
        response: { scopeId: 'string', createdAt: 'string' },
      },
      members: {
        add: {
          endpoint: '/api/scopes/:scopeId/members',
          method: 'POST' as const,
          auth: 'clerkJwt' as const,
          body: { userId: 'string' },
        },
        remove: {
          endpoint: '/api/scopes/:scopeId/members/:userId',
          method: 'DELETE' as const,
          auth: 'clerkJwt' as const,
        },
        list: {
          endpoint: '/api/scopes/:scopeId/members',
          method: 'GET' as const,
          auth: 'clerkJwt' as const,
          response: { members: 'Array<{ userId, joinedAt }>' },
        },
      },
    },
    signals: {
      push: {
        endpoint: '/api/signals/:source?scope=:scopeId',
        method: 'POST' as const,
        auth: 'appToken' as const,
        note: 'When ?scope= is present, writes to scope_signals (scope_id, source) instead of user_signals. Token owner must be a scope member.',
      },
      read: {
        endpoint: '/api/signals/:source?scope=:scopeId',
        method: 'GET' as const,
        auth: 'appToken' as const,
        note: 'Token owner must be a scope member. Returns { source, signal, pushedAt }.',
      },
    },
    grants: {
      note: 'Two grant types share the same endpoint. user grants: User A shares sources with User B. scope grants: any scope member can read listed sources from the scope signal store. Use GrantDeclaration type from this package.',
      create: {
        endpoint: '/api/grants',
        method: 'POST' as const,
        auth: 'clerkJwt' as const,
        body: 'GrantDeclaration',
        response: { grantId: 'string', expiresAt: 'string | null' },
      },
      list: {
        endpoint: '/api/grants',
        method: 'GET' as const,
        auth: 'clerkJwt' as const,
        response: 'Array<{ grantId, type, grantee, sources, trustLevel, createdAt }>',
        note: 'Returns grants the current user has received (inbound).',
      },
      revoke: {
        endpoint: '/api/grants/:grantId',
        method: 'DELETE' as const,
        auth: 'clerkJwt' as const,
      },
    },
  },

  /**
   * Attribution Claims — provenance assertions
   *
   * Apps claim credit for actions/outcomes. Append-only — claims are never deleted.
   * Fulfillment quality feeds back into trust in the claiming app.
   * RFC #40
   */
  claims: {
    create: {
      endpoint: '/api/claims',
      method: 'POST' as const,
      auth: ['appToken', 'userToken'] as const,
      description: 'Create an attribution claim.',
      body: {
        action: 'string — what happened (e.g. "idea-generated", "recommendation-accepted")',
        subjectId: 'string — entity the claim is about (app-defined ID)',
        confidence: 'number? — 0–1, default 1.0',
        evidence: 'object? — app-defined supporting data',
        occurredAt: 'string? — ISO 8601, defaults to now',
      },
      response: {
        id: 'string',
        action: 'string',
        subjectId: 'string',
        confidence: 'number',
      },
    },
    list: {
      endpoint: '/api/claims',
      method: 'GET' as const,
      auth: ['appToken', 'userToken', 'clerkJwt'] as const,
      description: 'List attribution claims. Filterable by subject and app.',
      queryParams: {
        subject: 'string? — filter by subject_id',
        app_id: 'string? — filter by claiming app',
      },
    },
  },

  /**
   * Corrections — structured disagreement
   *
   * Append-only audit trail for correcting signals, claims, or capabilities.
   * The original is never deleted — corrections layer on top.
   * RFC #41
   */
  corrections: {
    create: {
      endpoint: '/api/corrections',
      method: 'POST' as const,
      auth: ['appToken', 'userToken', 'clerkJwt'] as const,
      description: 'Create a correction for a prior signal, claim, or capability.',
      body: {
        targetType: '"signal" | "attribution" | "capability"',
        targetId: 'string — ID of the record being corrected',
        reason: 'string — why the correction is being made',
        correctedPayload: 'object? — the corrected data',
      },
      response: {
        id: 'string',
        targetType: 'string',
        targetId: 'string',
        correctorType: '"user" | "app"',
        correctorId: 'string',
      },
    },
    list: {
      endpoint: '/api/corrections',
      method: 'GET' as const,
      auth: ['appToken', 'userToken', 'clerkJwt'] as const,
      description: 'List corrections for a target record.',
      queryParams: {
        target_id: 'string — required, ID of the corrected record',
        target_type: 'string? — filter by type (signal, attribution, capability)',
      },
    },
  },

  tokenScopes: {
    'signals:push': {
      description: 'Push derived heuristic signals to /api/signals/:source',
      grantedBy: 'app token',
    },
    'signature:push': {
      description: 'Sync structural signatures to /api/apps/:slug/signature',
      grantedBy: 'app token or Clerk JWT',
    },
    'signals:read': {
      description: 'Read signals for the authenticated user from any source via GET /api/signals/:source',
      grantedBy: 'app token (reads for token owner) or Clerk JWT (reads for logged-in user)',
    },
  },
} as const

// ── Backward-compatible alias ────────────────────────────────────────────────

/**
 * @deprecated Use CAPABILITY_CONTRACT instead.
 * INTEGRATION_CONTRACT is preserved as an alias for backward compatibility.
 */
export const INTEGRATION_CONTRACT = CAPABILITY_CONTRACT

// ── Derived Types ────────────────────────────────────────────────────────────

export type CapabilityPattern = keyof typeof CAPABILITY_CONTRACT.patterns
export type CapabilityTokenScope = keyof typeof CAPABILITY_CONTRACT.tokenScopes
export type KnownSignalSource = keyof typeof CAPABILITY_CONTRACT.patterns.signalPush.knownSources
export type ScopeType = ScopeDeclaration['type']
export type GrantType = GrantDeclaration['type']
export type GrantTrustLevel = GrantDeclaration['trustLevel']

/** @deprecated Use CapabilityPattern instead */
export type IntegrationPattern = CapabilityPattern
/** @deprecated Use CapabilityTokenScope instead */
export type IntegrationTokenScope = CapabilityTokenScope
