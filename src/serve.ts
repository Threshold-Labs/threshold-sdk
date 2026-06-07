/**
 * serveVault — the one-call trust-gated capability server (Tier 0, roadmap #5).
 *
 * The serving half of the vault exchange: gateDataRequest verifies the caller's
 * thld_va_ credential, projectByTrust shapes the response to the credential's
 * trust level. Three capabilities (interest-graph, calendar-graph,
 * reading-history) hand-rolled this exact skeleton before it was absorbed here —
 * the full Pattern 6b provider template (DEVELOPERS.md §5b) in one call:
 *
 *   import { serveVault } from '@threshold-labs/integration/serve'
 *
 *   const vault = await serveVault({
 *     audience: 'interest-graph',
 *     getData: () => graph,
 *     projections: {
 *       'metadata-only': (g) => ({ people: g.nodes.length }),
 *       partial: (g) => quantize(g),
 *       full: (g) => g,
 *     },
 *     // dev: publicJwk/issuer from threshold-dev's GET /dev/info — or set
 *     // TRUST_ISSUER and they're fetched automatically. Omit all three in
 *     // production to verify against the Threshold signing key.
 *   })
 *
 * Endpoints served:
 *   GET <path>   (default /data) — trust-gated, projected. ?param=... is passed
 *                to the subgraph projection as params when the credential grants
 *                'subgraph'.
 *   GET /health  — heartbeat: { healthy, capability, uptimeMs }
 *
 * Node-only (node:http). Workers/fetch-handler surfaces should call
 * gateDataRequest + projectByTrust directly — they're transport-agnostic.
 *
 * For anything beyond one read surface (multiple routes, POST ingestion,
 * caching), graduate to the hand-rolled template in DEVELOPERS.md §5b — this
 * helper is the floor, not the ceiling.
 */

import { createServer, type ServerResponse } from 'node:http'

import { gateDataRequest } from './vault.js'
import { projectByTrust, type TrustProjections } from './redact.js'
import { devVerifyOptions } from './dev-server.js'

export interface ServeVaultOptions<T> {
  /** Capability id — must match the credential's audience claim. */
  audience: string
  /** Produce the unprojected dataset. Called per request — return a cached value for hot paths. */
  getData: () => T | Promise<T>
  /** Trust-level projections (fall-DOWN-only; 'metadata-only' is the required floor). */
  projections: TrustProjections<T>
  /** Default 4040. Pass 0 for an ephemeral port (read it from the handle). */
  port?: number
  /** Path of the gated read surface. Default '/data'. */
  path?: string
  /** Verification key/issuer — threshold-dev's from GET /dev/info, or omit for production.
   *  If neither is given and TRUST_ISSUER is set, fetched from `${TRUST_ISSUER}/dev/info`. */
  publicJwk?: JsonWebKey
  issuer?: string
}

export interface VaultServerHandle {
  port: number
  /** The gated read surface, e.g. http://localhost:4040/data */
  url: string
  close(): Promise<void>
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

export async function serveVault<T>(options: ServeVaultOptions<T>): Promise<VaultServerHandle> {
  const path = options.path ?? '/data'
  const startTime = Date.now()

  const verify: { publicJwk?: JsonWebKey; issuer?: string } = {
    ...(options.publicJwk ? { publicJwk: options.publicJwk } : {}),
    ...(options.issuer ? { issuer: options.issuer } : {}),
  }
  if (!verify.publicJwk && process.env.TRUST_ISSUER) {
    Object.assign(verify, await devVerifyOptions(process.env.TRUST_ISSUER))
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      if (req.method === 'OPTIONS') {
        json(res, 204, null)
        return
      }
      if (req.method !== 'GET') {
        json(res, 405, { error: 'method not allowed' })
        return
      }

      if (url.pathname === '/health') {
        json(res, 200, { healthy: true, capability: options.audience, uptimeMs: Date.now() - startTime })
        return
      }

      if (url.pathname === path) {
        const gate = await gateDataRequest(req.headers.authorization, {
          audience: options.audience,
          ...verify,
        })
        if (!gate.ok) {
          json(res, gate.status, { error: gate.error })
          return
        }
        const data = await options.getData()
        const subgraphParams = Object.fromEntries(url.searchParams)
        json(res, 200, projectByTrust(data, gate.payload.trustLevel, options.projections, subgraphParams))
        return
      }

      json(res, 404, {
        capability: options.audience,
        endpoints: { [`GET ${path}`]: 'trust-gated read (thld_va_ credential)', 'GET /health': 'heartbeat' },
      })
    })().catch(() => json(res, 500, { error: 'internal error' }))
  })

  const requestedPort = options.port ?? 4040
  await new Promise<void>((resolve) => server.listen(requestedPort, resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : requestedPort

  return {
    port,
    url: `http://localhost:${port}${path}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
