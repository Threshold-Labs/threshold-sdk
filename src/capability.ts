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
