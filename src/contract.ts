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
  version: '0.1.0',
  baseUrl: 'https://thresholdlabs.io',

  auth: {
    appToken: {
      prefix: 'thld_',
      header: 'Authorization',
      format: 'Bearer <token>',
      note: 'Issued per-app from the Ecosystem dashboard. Identifies the app and its owner.',
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
      note: 'Scoped token allowing an app to read a specific user integration (e.g. Spotify).',
    },
  },

  patterns: {
    /**
     * Pattern 1: Signal Push
     *
     * External apps compute a derived signal locally and push it to Threshold.
     * Raw data stays on the app — only the heuristic is transmitted.
     * Auth: app token
     */
    signalPush: {
      endpoint: '/api/signals/:source',
      method: 'POST' as const,
      auth: 'appToken' as const,
      description:
        'Push a derived heuristic signal to Threshold. The source is your app slug (e.g. "project-control"). The body is free-form JSON — the schema is defined by your app.',
      knownSources: {
        'project-control': {
          description: 'Developer focus and attention data from project-control',
          schema: {
            activeProject: 'string — current project slug (client work sanitized)',
            focusScore: 'number 0-100 — computed from switch rate and deep work blocks',
            driftDetected: 'boolean — true if project changed since last push',
            label: 'string — human-readable label for the signal',
            pushedAt: 'string — ISO 8601 timestamp',
          },
        },
        'ai-dj': {
          description: 'Music taste signal from AI-DJ',
          schema: {
            mood: 'string — current detected mood',
            genres: 'string[] — active genre cluster',
            energyLevel: 'number 0-1',
          },
        },
      },
      response: {
        ok: 'boolean',
        pushedAt: 'string — ISO 8601 timestamp of when the signal was stored',
      },
    },

    /**
     * Pattern 2: Signal Read (deferred — single consumer today)
     *
     * Read signals pushed by another app, subject to trust graph permissions.
     * Not yet implemented. Watch /developers for updates.
     */
    signalRead: {
      endpoint: '/api/signals/:source (GET) — coming soon',
      auth: 'clerkJwt' as const,
      description: 'Read signals from a source, subject to trust graph permissions. Not yet available.',
      status: 'coming-soon' as const,
    },

    /**
     * Pattern 3: Graph Embedding Telemetry
     *
     * Apps using @threshold-labs/core to compute structural signatures send
     * those signatures to Threshold. Threshold stores history, detects drift,
     * and (with user permission) enables cross-app structural comparison.
     * Auth: app token or Clerk JWT
     */
    graphSignature: {
      endpoint: '/api/apps/:slug/signature',
      method: 'POST' as const,
      auth: ['appToken', 'clerkJwt'] as const,
      description:
        'Sync a structural signature computed by @threshold-labs/core. The slug must match an app registered in your Threshold dashboard.',
      package: '@threshold-labs/core',
      provenance: ['connected', 'anonymous', 'projection'] as const,
      body: {
        viewName: 'string — identifies the graph view (e.g. "main", "filtered")',
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
      description: 'Read signals from other apps (subject to trust graph) — coming soon',
      grantedBy: 'Clerk JWT with trust edge',
      status: 'coming-soon',
    },
  },
} as const

export type IntegrationPattern = keyof typeof INTEGRATION_CONTRACT.patterns
export type IntegrationScope = keyof typeof INTEGRATION_CONTRACT.scopes
export type KnownSignalSource = keyof typeof INTEGRATION_CONTRACT.patterns.signalPush.knownSources
