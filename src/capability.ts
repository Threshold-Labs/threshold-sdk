/**
 * Capability helpers — client-side SDK for declaring and composing capabilities.
 *
 * Usage:
 *   import { declareCapability, composeCapabilities } from '@threshold-labs/integration/capability'
 */

import type { CapabilityDeclaration, ResolvedCapability, DataAccessResult } from './contract.js'
import { CAPABILITY_CONTRACT } from './contract.js'

export type { CapabilityDeclaration, ResolvedCapability, DataAccessResult }

export interface DeclareCapabilityOptions {
  /** Clerk JWT or app token */
  token: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
}

export interface DeclareCapabilityResult {
  id: string
  capabilityId: string
  createdAt: string
}

/**
 * Declare a capability owned by the authenticated user.
 *
 * @example
 * ```ts
 * await declareCapability({
 *   id: 'spotify-connector',
 *   name: 'My Spotify',
 *   description: 'Spotify listening data',
 *   type: 'connector',
 *   canonicalFor: 'spotify',
 *   trustLevel: 'partial',
 *   minimumTrust: 'acquaintance',
 * }, { token: clerkJwt })
 * ```
 */
export async function declareCapability(
  declaration: CapabilityDeclaration,
  options: DeclareCapabilityOptions
): Promise<DeclareCapabilityResult> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const res = await fetch(`${baseUrl}/api/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      capabilityId: declaration.id,
      name: declaration.name,
      type: declaration.type,
      canonicalFor: declaration.canonicalFor,
      trustLevel: declaration.trustLevel,
      minimumTrust: declaration.minimumTrust,
      endpoint: declaration.endpoint,
      declaration,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`declareCapability failed: ${err.error}`)
  }

  return res.json() as Promise<DeclareCapabilityResult>
}

export interface ResolveCapabilityOptions {
  /** Grant token (thld_cg_), app token (thld_), or Clerk JWT */
  token: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
}

/**
 * Resolve a capability at runtime — discover its endpoint, trust level, and status.
 *
 * Works with any auth type:
 * - Grant token (thld_cg_): returns trust level from the grant
 * - App token (thld_): requires the app to compose this capability
 * - Clerk JWT: owner self-resolve, always returns trustLevel='full'
 *
 * @example
 * ```ts
 * const cap = await resolveCapability('cap-uuid', { token: grantToken })
 * if (cap?.endpoint) {
 *   // Now you know where the capability lives and what trust level you have
 *   console.log(cap.endpoint, cap.trustLevel)
 * }
 * ```
 */
export async function resolveCapability(
  capabilityId: string,
  options: ResolveCapabilityOptions
): Promise<ResolvedCapability | null> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const res = await fetch(`${baseUrl}/api/capabilities/${capabilityId}/resolve`, {
    headers: {
      Authorization: `Bearer ${options.token}`,
    },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`resolveCapability failed: ${err.error}`)
  }

  return res.json() as Promise<ResolvedCapability>
}

export interface RequestDataAccessOptions {
  /** Grant token (thld_cg_) or app token (thld_) */
  token: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
}

/**
 * Request a trust-scoped data access credential for a capability.
 *
 * Returns the capability's endpoint + a signed credential (thld_va_ JWT).
 * Present the credential as a Bearer token when calling the capability endpoint.
 * The credential encodes the trust level, so the capability knows how to filter
 * its response — Threshold stays out of the data path.
 *
 * @example
 * ```ts
 * const access = await requestDataAccess('cap-uuid', { token: grantToken })
 * // Call the capability directly with the credential
 * const data = await fetch(access.endpoint, {
 *   headers: { Authorization: `Bearer ${access.credential}` },
 * }).then(r => r.json())
 * ```
 */
export async function requestDataAccess(
  capabilityId: string,
  options: RequestDataAccessOptions
): Promise<DataAccessResult> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const res = await fetch(`${baseUrl}/api/capabilities/${capabilityId}/data`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`requestDataAccess failed: ${err.error}`)
  }

  return res.json() as Promise<DataAccessResult>
}

export interface HeartbeatOptions {
  /** App token or Clerk JWT — must own the capability */
  token: string
  /** Override base URL */
  baseUrl?: string
  /** Declared heartbeat interval in ms (used by Threshold to compute staleness: 3x this value) */
  intervalMs?: number
  /** Provider-defined metadata: version, load, model name, etc. */
  metadata?: Record<string, unknown>
}

export interface HeartbeatResult {
  ok: boolean
  capabilityId: string
  lastSeen: string
}

/**
 * Report capability liveness to Threshold.
 *
 * Call this on a regular interval (e.g. every 60s) from your capability provider.
 * Threshold derives availability from heartbeat recency and surfaces it
 * in resolveCapability() responses.
 *
 * @example
 * ```ts
 * // On startup and every 60s
 * setInterval(() => {
 *   heartbeat('my-capability-id', {
 *     token: appToken,
 *     intervalMs: 60_000,
 *     metadata: { version: '1.2.0', model: 'qwen2.5-7b' }
 *   })
 * }, 60_000)
 * ```
 */
export async function heartbeat(
  capabilityId: string,
  options: HeartbeatOptions
): Promise<HeartbeatResult> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const body: Record<string, unknown> = {}
  if (options.intervalMs != null) body.intervalMs = options.intervalMs
  if (options.metadata) body.metadata = options.metadata

  const res = await fetch(`${baseUrl}/api/capabilities/${capabilityId}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`heartbeat failed: ${err.error}`)
  }

  return res.json() as Promise<HeartbeatResult>
}

export interface ListCapabilitiesOptions {
  /** Clerk JWT or app token */
  token: string
  /** Override base URL (default: https://thresholdlabs.io) */
  baseUrl?: string
}

/**
 * A capability as registered in the Threshold registry.
 * Normalized from the wire format (snake_case row, JSON-string declaration).
 */
export interface RegisteredCapability {
  /** Registry UUID */
  id: string
  /** Owner-scoped capability id, e.g. 'interest-graph' */
  capabilityId: string
  name: string
  type: string | null
  canonicalFor: string | null
  trustLevel: string
  minimumTrust: string
  endpoint: string | null
  status: string
  adherenceScore: number | null
  createdAt: string
  updatedAt: string
  /** Full behavioral contract, if registered */
  declaration: CapabilityDeclaration | null
}

/** Raw row shape returned by GET /api/capabilities (D1 snake_case). */
interface CapabilityRow {
  id: string
  capability_id: string
  name: string
  type: string | null
  canonical_for: string | null
  trust_level: string
  minimum_trust: string
  endpoint: string | null
  status: string
  adherence_score: number | null
  created_at: string
  updated_at: string
  declaration: string | null
}

/**
 * List all capabilities owned by the authenticated user.
 *
 * This is the readable registry — the answer to "what already exists, so I
 * don't build it twice?" Works for humans (browse your catalog) and for
 * coding agents (call it before scaffolding anything new; see
 * registryMarkdown() for a context-window-friendly digest).
 *
 * @example
 * ```ts
 * const caps = await listCapabilities({ token: appToken })
 * const existing = caps.find(c => c.capabilityId === 'local-inference')
 * if (existing) {
 *   // compose it — don't rebuild it
 * }
 * ```
 */
export async function listCapabilities(
  options: ListCapabilitiesOptions
): Promise<RegisteredCapability[]> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl
  const res = await fetch(`${baseUrl}/api/capabilities`, {
    headers: {
      Authorization: `Bearer ${options.token}`,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(`listCapabilities failed: ${err.error}`)
  }

  const rows = await res.json() as CapabilityRow[]
  return rows.map((row) => {
    let declaration: CapabilityDeclaration | null = null
    if (row.declaration) {
      try {
        declaration = JSON.parse(row.declaration) as CapabilityDeclaration
      } catch {
        // tolerate malformed legacy rows — the row fields still describe the capability
      }
    }
    return {
      id: row.id,
      capabilityId: row.capability_id,
      name: row.name,
      type: row.type,
      canonicalFor: row.canonical_for,
      trustLevel: row.trust_level,
      minimumTrust: row.minimum_trust,
      endpoint: row.endpoint,
      status: row.status,
      adherenceScore: row.adherence_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      declaration,
    }
  })
}

/**
 * Render a registry listing as a compact markdown digest.
 *
 * Designed to be pasted into a project's CLAUDE.md (or injected into an
 * agent's context) so coding agents check the registry before building:
 * each row carries enough contract to decide "compose, don't rebuild."
 *
 * @example
 * ```ts
 * const caps = await listCapabilities({ token: appToken })
 * console.log(registryMarkdown(caps))
 * ```
 */
export function registryMarkdown(capabilities: RegisteredCapability[]): string {
  const active = capabilities.filter((c) => c.status === 'active')
  const lines = [
    '## Threshold capability registry — check before building',
    '',
    'These capabilities already exist. Compose them (`resolveCapability` + `requestDataAccess`',
    "from `@threshold-labs/integration/capability`) instead of rebuilding them.",
    '',
    '| id | type | trust | description |',
    '|---|---|---|---|',
  ]
  for (const cap of active) {
    const description = cap.declaration?.description ?? cap.name
    const deps = cap.declaration?.requiredCapabilities?.length
      ? ` (requires: ${cap.declaration.requiredCapabilities.join(', ')})`
      : ''
    lines.push(
      `| \`${cap.capabilityId}\` | ${cap.type ?? '—'} | ${cap.trustLevel}/${cap.minimumTrust} | ${description}${deps} |`
    )
  }
  return lines.join('\n')
}

export interface ComposeCapabilitiesOptions {
  /** Clerk JWT or app token */
  token: string
  /** Override base URL */
  baseUrl?: string
}

/**
 * Add capabilities to an app's composition.
 *
 * @example
 * ```ts
 * await composeCapabilities('ai-dj', [capId1, capId2], { token: clerkJwt })
 * ```
 */
export async function composeCapabilities(
  appSlug: string,
  capabilityIds: string[],
  options: ComposeCapabilitiesOptions
): Promise<void> {
  const baseUrl = options.baseUrl || CAPABILITY_CONTRACT.baseUrl

  await Promise.all(
    capabilityIds.map(async (capId) => {
      const res = await fetch(`${baseUrl}/api/apps/${appSlug}/capabilities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify({ capabilityId: capId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
        throw new Error(`composeCapabilities failed for ${capId}: ${err.error}`)
      }
    })
  )
}
