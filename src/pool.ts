/**
 * Pool primitives — trust-graph-scoped membership, consent, and the pool gate.
 *
 * A pool is a group-owned capability surface (shared knowledge artifact,
 * cost-shared compute) whose membership IS the trust graph: members are the
 * people the pool's anchor trusts at or above the pool's minimum tier. There
 * is no member table to administer — key issuance and revocation flow from
 * trust edges:
 *
 *   - Issuance: a member requests a data credential for a pool capability
 *     (requestDataAccess); the trust gate passes because the anchor→member
 *     edge clears the pool's minimumTrust.
 *   - Revocation: the anchor removes or downgrades the edge. gatePoolRequest
 *     re-derives membership on every request, so revocation takes effect at
 *     the NEXT request — not at credential expiry.
 *
 * Consent is a separate axis from membership: an opted-out member is still a
 * member (they can query the pool) but their content is excluded from the
 * pool's index and any derived artifact. filterOptedOut is err-closed:
 * content that cannot be attributed to a member is dropped by default,
 * because unattributable content cannot be verified as consented.
 *
 * Usage:
 *   import {
 *     derivePoolMembership, poolCapabilityDeclaration,
 *     isOptedOut, filterOptedOut, gatePoolRequest,
 *   } from '@threshold-labs/integration/pool'
 */

import type { CapabilityDeclaration, MinimumTrust, TrustLevel } from './contract.js'
import { gateDataRequest, type DataCredentialPayload } from './vault.js'

// ── Trust tiers ──────────────────────────────────────────────────────────────

/**
 * Least → most trusted. Mirrors the ladder the trust gate walks in
 * threshold-dev and the platform worker; exported here so pool logic and
 * capability code share one ordering. (dev-server keeps a private copy —
 * converge them there on its next touch.)
 */
export const MINIMUM_TRUST_ORDER: readonly MinimumTrust[] = [
  'acquaintance',
  'colleague',
  'client',
  'friend',
  'close',
  'partner',
]

/** Does `tier` clear `minimum`? Unknown tiers never clear (err closed). */
export function trustAtLeast(tier: MinimumTrust | string | undefined | null, minimum: MinimumTrust): boolean {
  if (!tier) return false
  const tierIdx = MINIMUM_TRUST_ORDER.indexOf(tier as MinimumTrust)
  const minIdx = MINIMUM_TRUST_ORDER.indexOf(minimum)
  return tierIdx !== -1 && minIdx !== -1 && tierIdx >= minIdx
}

// ── Pool declaration + membership ────────────────────────────────────────────

/** A directed trust edge: `from` trusts `to` at `tier`. */
export interface TrustEdge {
  from: string
  to: string
  tier: MinimumTrust
}

/**
 * A pool — a group-owned capability surface anchored in the trust graph.
 *
 * The anchor is the person the group already organizes around (the community
 * owner). Membership is not stored on this object; it is derived from trust
 * edges at the moment it is needed.
 */
export interface PoolDeclaration {
  /** Unique pool id, e.g. 'vibecoders' */
  id: string
  name: string
  description: string
  /** The user whose trust edges define membership, e.g. 'user:anchor' */
  anchorId: string
  /** Minimum anchor→member trust tier for membership */
  minimumTrust: MinimumTrust
  /** Capability ids this pool serves (declared by the anchor), e.g. ['group-brain'] */
  capabilities: string[]
}

export interface PoolMember {
  memberId: string
  /** The anchor→member trust tier that admitted them */
  tier: MinimumTrust
}

/**
 * Derive the pool's current membership from trust edges.
 *
 * Pure and deterministic: members are exactly the targets of anchor-rooted
 * edges whose tier clears the pool's minimumTrust, plus the anchor. Edges
 * not rooted at the anchor are ignored — pool membership is anchor-scoped
 * by design (trust is not transitive here).
 *
 * Revocation is this function run again after the edge changed.
 */
export function derivePoolMembership(pool: PoolDeclaration, edges: TrustEdge[]): PoolMember[] {
  const members = new Map<string, PoolMember>()
  // The anchor is always a member of their own pool.
  members.set(pool.anchorId, { memberId: pool.anchorId, tier: 'partner' })
  for (const edge of edges) {
    if (edge.from !== pool.anchorId) continue
    if (!trustAtLeast(edge.tier, pool.minimumTrust)) continue
    const existing = members.get(edge.to)
    // Keep the highest tier if duplicate edges exist.
    if (!existing || MINIMUM_TRUST_ORDER.indexOf(edge.tier) > MINIMUM_TRUST_ORDER.indexOf(existing.tier)) {
      members.set(edge.to, { memberId: edge.to, tier: edge.tier })
    }
  }
  return [...members.values()]
}

/**
 * Render a pool as a CapabilityDeclaration — the declared/consumed bridge.
 *
 * The anchor declares the pool's capability exactly like any other capability
 * (declareCapability from ./capability); consumers resolve and request access
 * to it the normal way. The pool adds nothing bespoke to the wire contract.
 */
export function poolCapabilityDeclaration(
  pool: PoolDeclaration,
  capability: {
    id: string
    name: string
    description: string
    trustLevel: TrustLevel
    endpoint?: string
  }
): CapabilityDeclaration {
  return {
    id: capability.id,
    name: capability.name,
    description: capability.description,
    type: 'vault',
    ownerType: 'user',
    trustLevel: capability.trustLevel,
    minimumTrust: pool.minimumTrust,
    endpoint: capability.endpoint,
    cadence: { expected: 'on-demand' },
  }
}

// ── Consent / opt-out ────────────────────────────────────────────────────────

/**
 * What a member is opting out of:
 *   - 'index':    their content is excluded from the pool's search/ask index
 *   - 'artifact': their content is excluded from derived artifacts (pages,
 *                 summaries, per-person threads)
 *   - 'all':      both
 *
 * Opting out does NOT remove membership — an opted-out member can still
 * query the pool; their own contributions just stop being served.
 */
export type ConsentScope = 'index' | 'artifact' | 'all'

export interface OptOutRecord {
  memberId: string
  scope: ConsentScope
  /** ISO timestamp the opt-out was recorded */
  recordedAt: string
  note?: string
}

/** Is this member opted out of the given surface? */
export function isOptedOut(
  memberId: string,
  optOuts: OptOutRecord[],
  surface: 'index' | 'artifact'
): boolean {
  return optOuts.some(
    (record) => record.memberId === memberId && (record.scope === 'all' || record.scope === surface)
  )
}

export interface FilterOptedOutOptions<T> {
  /** Which pool surface this content is destined for */
  surface: 'index' | 'artifact'
  /** Attribute an item to a member id; return null/undefined if unattributable */
  memberIdOf: (item: T) => string | null | undefined
  /**
   * What to do with unattributable content. Default 'drop' (err closed):
   * content that cannot be attributed cannot be verified as consented.
   * Pass 'keep' only for content that is structurally member-free
   * (e.g. pool-level metrics with no per-person payload).
   */
  unattributed?: 'drop' | 'keep'
}

/**
 * Structurally exclude opted-out members' content before it reaches an index
 * or artifact. The filterSensitive idiom applied to consent: run this INSIDE
 * every pipeline that builds a member-visible surface, so a downstream bug
 * can never serve content the member withdrew.
 */
export function filterOptedOut<T>(
  items: T[],
  optOuts: OptOutRecord[],
  options: FilterOptedOutOptions<T>
): T[] {
  const unattributed = options.unattributed ?? 'drop'
  return items.filter((item) => {
    const memberId = options.memberIdOf(item)
    if (memberId == null) return unattributed === 'keep'
    return !isOptedOut(memberId, optOuts, options.surface)
  })
}

// ── Pool gate ────────────────────────────────────────────────────────────────

/** Result of gating a pool request — never throws. */
export type PoolGateResult =
  | { ok: true; payload: DataCredentialPayload; member: PoolMember }
  | { ok: false; status: 401 | 403; error: string }

/**
 * Gate an incoming request to a pool capability endpoint.
 *
 * Two checks, in order:
 *   1. Credential (401): a valid thld_va_ data credential scoped to this
 *      capability — gateDataRequest, unchanged.
 *   2. Membership (403): the credential's grantee is in the pool's CURRENT
 *      membership, derived from the trust edges passed in. This is what makes
 *      revocation graph-native: a still-valid credential held by someone the
 *      anchor no longer trusts stops working on their next request.
 *
 * The caller supplies current edges (from the trust graph, a synced snapshot,
 * or threshold-dev's /dev/info) — the gate stays pure over them.
 */
export async function gatePoolRequest(
  authorizationHeader: string | undefined | null,
  options: {
    pool: PoolDeclaration
    /** Current trust edges — membership is re-derived from these every call */
    edges: TrustEdge[]
    /** Capability slug the credential must be scoped to (must be one of pool.capabilities) */
    audience: string
    crypto?: Crypto
    /** Override the signing public key (e.g. a threshold-dev ephemeral key). Defaults to production. */
    publicJwk?: JsonWebKey
    /** Override the expected issuer. Defaults to production (https://thresholdlabs.io). */
    issuer?: string
  }
): Promise<PoolGateResult> {
  const gate = await gateDataRequest(authorizationHeader, {
    audience: options.audience,
    crypto: options.crypto,
    publicJwk: options.publicJwk,
    issuer: options.issuer,
  })
  if (!gate.ok) return gate

  const membership = derivePoolMembership(options.pool, options.edges)
  const member = membership.find((m) => m.memberId === gate.payload.grantee)
  if (!member) {
    return {
      ok: false,
      status: 403,
      error: `not a member of pool '${options.pool.id}' — membership is anchored at ${options.pool.anchorId} (minimum trust: ${options.pool.minimumTrust})`,
    }
  }
  return { ok: true, payload: gate.payload, member }
}
