/**
 * Threshold Integration Contract
 *
 * Single source of truth for the Threshold external integration surface.
 * Import this in docs, the /developers page, and any tooling that validates
 * integration payloads.
 *
 * This file lives in @threshold-labs/integration — a public repo.
 * External apps file issues here when the interface needs to change.
 * https://github.com/Threshold-Labs/threshold-sdk
 */

export const INTEGRATION_CONTRACT = {
  version: '0.3.0',
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
    connectToken: {
      prefix: 'thld_ct_',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Scoped per-user token allowing an app to read a specific integration (e.g. Spotify). Generated via POST /api/integrations/grants/:appId/:source/connect-token — requires the user to be authenticated and have enabled that source for your app.',
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
      method: 'POST' as const,
      auth: ['appToken', 'clerkJwt'] as const,
      description:
        'Sync a structural signature computed by @threshold-labs/core. The slug must match an app registered in your Threshold dashboard. viewName is scoped to your app — no prefix needed.',
      package: '@threshold-labs/core',
      provenance: ['connected', 'anonymous', 'projection'] as const,
      body: {
        viewName: 'string — identifies the graph view (e.g. "current", "target", "filtered")',
        signature: 'StructuralSignature — output of computeSignature() from @threshold-labs/core',
      },
      response: {
        ok: 'boolean',
      },
    },
  },

  scopes: {
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

export type IntegrationPattern = keyof typeof INTEGRATION_CONTRACT.patterns
export type IntegrationScope = keyof typeof INTEGRATION_CONTRACT.scopes
export type KnownSignalSource = keyof typeof INTEGRATION_CONTRACT.patterns.signalPush.knownSources
