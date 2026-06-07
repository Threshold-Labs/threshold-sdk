#!/usr/bin/env node
/**
 * threshold-dev — local mock of the Threshold trust graph + token issuer.
 *
 * Tier 0 of the SDK roadmap: makes the DIFFERENTIATED thing (trust-gated
 * cross-user data flow) runnable cold — no account, no production graph.
 * Until this existed, verifyVaultCredential/verifyDataCredential pinned the
 * production signing key, so the core flow could not be exercised locally
 * (the "pattern, not runtime" cold-start finding).
 *
 * The server generates an ephemeral ECDSA P-256 keypair at startup and signs
 * REAL ES256 credentials — verification on the capability side is
 * cryptographically honest, just against the dev key:
 *
 *   const info = await fetch('http://localhost:8787/dev/info').then(r => r.json())
 *   const payload = await verifyDataCredential(bearer, {
 *     audience: 'my-capability',
 *     publicJwk: info.jwk,
 *     issuer: info.issuer,
 *   })
 *
 * Seeded world: two users (alice, bob), tokens thld_dev_alice / thld_dev_bob,
 * and a symmetric 'friend' trust edge. Enough to declare a capability as
 * alice and request trust-scoped access to it as bob.
 *
 * Usage:
 *   npx threshold-dev              # port 8787
 *   PORT=9000 npx threshold-dev
 *
 * Zero dependencies — node:http + webcrypto. In-memory state, gone on exit.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { webcrypto } from 'node:crypto'

import type { CapabilityDeclaration, MinimumTrust, TrustLevel } from './contract.js'

const TRUST_TIER_ORDER: MinimumTrust[] = ['acquaintance', 'colleague', 'client', 'friend', 'close', 'partner']

interface DevUser {
  id: string
  token: string
}

interface CapabilityRow {
  id: string
  owner_id: string
  provider_id: string | null
  capability_id: string
  name: string
  type: string | null
  canonical_for: string | null
  trust_level: string
  minimum_trust: string
  cadence: string | null
  adherence_score: number | null
  endpoint: string | null
  declaration: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface DevServerOptions {
  port?: number
}

export interface DevServerHandle {
  port: number
  issuer: string
  /** Public JWK — pass to verifyVaultCredential/verifyDataCredential as options.publicJwk */
  jwk: JsonWebKey
  close(): Promise<void>
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function createDevServer(options: DevServerOptions = {}): Promise<DevServerHandle> {
  const port = options.port ?? Number(process.env.PORT) ?? 8787
  const issuer = `http://localhost:${port}`

  // Ephemeral signing keypair — credentials die with the process. By design.
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey)

  // ── Seeded world ──────────────────────────────────────────────────────────
  const users: DevUser[] = [
    { id: 'user:alice', token: 'thld_dev_alice' },
    { id: 'user:bob', token: 'thld_dev_bob' },
  ]
  // trust.get('user:alice')!.get('user:bob') = how much ALICE trusts BOB
  const trust = new Map<string, Map<string, MinimumTrust>>([
    ['user:alice', new Map([['user:bob', 'friend' as MinimumTrust]])],
    ['user:bob', new Map([['user:alice', 'friend' as MinimumTrust]])],
  ])

  const capabilities: CapabilityRow[] = []
  const compositions: Array<{ appSlug: string; capabilityId: string }> = []
  let grantCounter = 0
  let rowCounter = 0

  function authUser(req: IncomingMessage): DevUser | null {
    const header = req.headers.authorization ?? ''
    const token = header.replace(/^Bearer\s+/i, '')
    return users.find((u) => u.token === token) ?? null
  }

  function findCapability(idOrSlug: string): CapabilityRow | undefined {
    return capabilities.find((c) => c.id === idOrSlug || c.capability_id === idOrSlug)
  }

  async function signCredential(claims: Record<string, unknown>): Promise<string> {
    const header = { alg: 'ES256', typ: 'JWT', kid: 'dev-signing-1' }
    const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)))
    const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(claims)))
    const signingInput = `${headerB64}.${payloadB64}`
    const sig = await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(signingInput)
    )
    return `thld_va_${signingInput}.${base64url(new Uint8Array(sig))}`
  }

  const server = createServer((req, res) => {
    void route(req, res).catch((err: unknown) => {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) })
    })
  })

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', issuer)
    const path = url.pathname

    // ── Discovery (no auth) ───────────────────────────────────────────────
    if (req.method === 'GET' && path === '/dev/info') {
      json(res, 200, {
        issuer,
        jwk: publicJwk,
        users: users.map((u) => ({ id: u.id, token: u.token })),
        trust: Object.fromEntries(
          [...trust.entries()].map(([owner, edges]) => [owner, Object.fromEntries(edges)])
        ),
        hint: 'Pass { publicJwk: jwk, issuer } to verifyDataCredential/verifyVaultCredential. Use a token as Authorization: Bearer <token>.',
      })
      return
    }

    if (req.method === 'GET' && path === '/dev/state') {
      json(res, 200, { capabilities, compositions })
      return
    }

    const user = authUser(req)
    if (!user) {
      json(res, 401, { error: 'Unauthorized — use a dev token from GET /dev/info' })
      return
    }

    // ── POST /api/capabilities (declare) ──────────────────────────────────
    if (req.method === 'POST' && path === '/api/capabilities') {
      const body = await readBody(req)
      const declaration = (body.declaration ?? body) as Partial<CapabilityDeclaration>
      if (!declaration.id || !declaration.name) {
        json(res, 400, { error: 'declaration.id and declaration.name are required' })
        return
      }
      const now = new Date().toISOString()
      const existing = capabilities.find(
        (c) => c.owner_id === user.id && c.capability_id === declaration.id
      )
      if (existing) {
        existing.declaration = JSON.stringify(declaration)
        existing.updated_at = now
        json(res, 200, { id: existing.id, capabilityId: existing.capability_id, createdAt: existing.created_at })
        return
      }
      const row: CapabilityRow = {
        id: `dev-cap-${++rowCounter}`,
        owner_id: user.id,
        provider_id: null,
        capability_id: declaration.id,
        name: declaration.name,
        type: declaration.type ?? null,
        canonical_for: declaration.canonicalFor ?? null,
        trust_level: declaration.trustLevel ?? 'metadata-only',
        minimum_trust: declaration.minimumTrust ?? 'partner',
        cadence: declaration.cadence ? JSON.stringify(declaration.cadence) : null,
        adherence_score: null,
        endpoint: declaration.endpoint ?? null,
        declaration: JSON.stringify(declaration),
        status: 'active',
        created_at: now,
        updated_at: now,
      }
      capabilities.push(row)
      json(res, 201, { id: row.id, capabilityId: row.capability_id, createdAt: row.created_at })
      return
    }

    // ── GET /api/capabilities (list — D1 wire shape) ──────────────────────
    if (req.method === 'GET' && path === '/api/capabilities') {
      json(res, 200, capabilities.filter((c) => c.owner_id === user.id && c.status !== 'revoked'))
      return
    }

    // ── GET /api/capabilities/:id/resolve ─────────────────────────────────
    const resolveMatch = path.match(/^\/api\/capabilities\/([^/]+)\/resolve$/)
    if (req.method === 'GET' && resolveMatch) {
      const cap = findCapability(decodeURIComponent(resolveMatch[1]))
      if (!cap) {
        json(res, 404, { error: 'capability not found' })
        return
      }
      const isOwner = cap.owner_id === user.id
      json(res, 200, {
        endpoint: cap.endpoint,
        trustLevel: isOwner ? 'full' : cap.trust_level,
        status: cap.status,
        reliability: 'healthy',
        availability: 'live',
        lastSeen: cap.updated_at,
        declaration: cap.declaration ? JSON.parse(cap.declaration) : null,
      })
      return
    }

    // ── POST /api/capabilities/:id/heartbeat ──────────────────────────────
    const heartbeatMatch = path.match(/^\/api\/capabilities\/([^/]+)\/heartbeat$/)
    if (req.method === 'POST' && heartbeatMatch) {
      const cap = findCapability(decodeURIComponent(heartbeatMatch[1]))
      if (!cap) {
        json(res, 404, { error: 'capability not found' })
        return
      }
      cap.updated_at = new Date().toISOString()
      json(res, 200, { ok: true, capabilityId: cap.capability_id, lastSeen: cap.updated_at })
      return
    }

    // ── POST /api/apps/:slug/capabilities (compose) ───────────────────────
    const composeMatch = path.match(/^\/api\/apps\/([^/]+)\/capabilities$/)
    if (req.method === 'POST' && composeMatch) {
      const body = await readBody(req)
      const capabilityId = String(body.capabilityId ?? '')
      if (!capabilityId) {
        json(res, 400, { error: 'capabilityId required' })
        return
      }
      compositions.push({ appSlug: decodeURIComponent(composeMatch[1]), capabilityId })
      json(res, 201, { ok: true })
      return
    }

    // ── POST /api/capabilities/:id/data (trust-gated credential issue) ────
    const dataMatch = path.match(/^\/api\/capabilities\/([^/]+)\/data$/)
    if (req.method === 'POST' && dataMatch) {
      const cap = findCapability(decodeURIComponent(dataMatch[1]))
      if (!cap) {
        json(res, 404, { error: 'capability not found' })
        return
      }
      const isOwner = cap.owner_id === user.id
      let trustLevel: TrustLevel
      if (isOwner) {
        trustLevel = 'full'
      } else {
        // THE trust gate: does the owner trust the requester at >= minimumTrust?
        const tier = trust.get(cap.owner_id)?.get(user.id)
        const tierIdx = tier ? TRUST_TIER_ORDER.indexOf(tier) : -1
        const requiredIdx = TRUST_TIER_ORDER.indexOf(cap.minimum_trust as MinimumTrust)
        if (tierIdx < requiredIdx) {
          json(res, 403, {
            error: `trust gate: ${cap.owner_id} trusts ${user.id} at '${tier ?? 'none'}', capability requires '${cap.minimum_trust}'`,
          })
          return
        }
        trustLevel = cap.trust_level as TrustLevel
      }
      const now = Math.floor(Date.now() / 1000)
      const exp = now + 15 * 60
      const credential = await signCredential({
        iss: issuer,
        sub: user.id,
        aud: cap.capability_id,
        trust_level: trustLevel,
        grant_id: `dev-grant-${++grantCounter}`,
        owner_id: cap.owner_id,
        iat: now,
        exp,
      })
      json(res, 200, {
        endpoint: cap.endpoint,
        credential,
        trustLevel,
        capabilityId: cap.capability_id,
        expiresAt: new Date(exp * 1000).toISOString(),
      })
      return
    }

    json(res, 404, { error: `no dev route for ${req.method} ${path}` })
  }

  await new Promise<void>((resolve) => server.listen(port, resolve))

  return {
    port,
    issuer,
    jwk: publicJwk,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}

// Run directly (bin entry) — not when imported by tests.
const isMain = process.argv[1]?.endsWith('dev-server.js') || process.argv[1]?.endsWith('threshold-dev')
if (isMain) {
  createDevServer()
    .then((handle) => {
      console.log(
        [
          `threshold-dev listening on ${handle.issuer}`,
          '',
          'Seeded users (Authorization: Bearer <token>):',
          '  user:alice  thld_dev_alice',
          '  user:bob    thld_dev_bob   (alice<->bob trust: friend)',
          '',
          'Try:',
          `  curl ${handle.issuer}/dev/info`,
          `  THRESHOLD_TOKEN=thld_dev_alice npx threshold-registry --base-url ${handle.issuer}`,
          '',
          'Capabilities verify dev credentials with { publicJwk, issuer } from GET /dev/info.',
        ].join('\n')
      )
    })
    .catch((err: unknown) => {
      console.error(`threshold-dev: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    })
}
