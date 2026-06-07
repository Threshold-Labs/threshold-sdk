/**
 * Trust-level response projection — the capability-side half of Pattern 6b.
 *
 * verifyDataCredential() tells a capability WHAT trust level the caller holds;
 * this module is HOW to shape the response to it. The contract:
 *
 *   - 'metadata-only': entity counts, tag lists, connection counts
 *   - 'redacted':      anonymized entity IDs, connection structure intact
 *   - 'partial':       full structure, quantized weights
 *   - 'full':          complete dataset
 *   - 'subgraph':      caller-specified filter (interpret from request params)
 *
 * The footgun this kills: hand-rolled if-chains that fall UP (an undefined
 * branch accidentally serving the full dataset). projectByTrust() falls DOWN —
 * an unimplemented level degrades to the next MORE restrictive projection,
 * and 'metadata-only' is required so there is always a safe floor.
 *
 * Usage (inside a capability endpoint):
 *   const { trustLevel } = await verifyDataCredential(bearer, { audience: 'interest-graph' })
 *   const body = projectByTrust(graph, trustLevel, {
 *     'metadata-only': (g) => ({ people: g.nodes.length, edges: g.edges.length }),
 *     redacted: (g) => anonymize(g),
 *     full: (g) => g,
 *     // 'partial' undefined → a partial-level caller gets the redacted projection
 *   })
 *
 * WHERE trustLevel COMES FROM (the gate-vs-knob boundary — canonical as of
 * 0.17.1, converged independently by web-activity 1c40253 ⇄ project-control
 * 218ac9f): projectByTrust doesn't care how `trustLevel` was obtained, so the
 * caller must. Two legitimate sources:
 *
 *   - GATE: a verified credential — gateDataRequest()/verifyDataCredential().
 *     Required on ANY surface reachable across a trust boundary (HTTP beyond
 *     loopback, tunnels, reverse proxies, cross-user anything).
 *   - KNOB: a caller-specified parameter (?trust=..., a tool argument). Legitimate
 *     ONLY where the transport itself is the trust boundary — an MCP stdio tool
 *     spawned by the consumer, a loopback-bound single-user dashboard.
 *
 * The forward hazard: a knob surface later exposed beyond its boundary turns
 * `trust=full` into an unauthenticated request for client + personal-sensitive
 * data. If a knob endpoint's binding ever widens, it MUST switch to the gate.
 */

import type { TrustLevel } from './contract.js'
import type { Governance } from './memory-connector.js'

/** Least → most permissive. 'subgraph' is intentionally absent — it is a
 *  filter grant, not a rung, and never participates in fallback. */
export const TRUST_LEVEL_LADDER = ['metadata-only', 'redacted', 'partial', 'full'] as const

export type LadderTrustLevel = (typeof TRUST_LEVEL_LADDER)[number]

export interface TrustProjections<T> {
  /** Required — the safe floor every caller can receive. */
  'metadata-only': (data: T) => unknown
  redacted?: (data: T) => unknown
  partial?: (data: T) => unknown
  full?: (data: T) => unknown
  /** Required to serve 'subgraph' grants; there is no safe automatic fallback
   *  for a caller-specified filter, so omitting it makes subgraph requests throw. */
  subgraph?: (data: T, params?: unknown) => unknown
}

/** Union of the return types of every defined projection — what projectByTrust returns. */
export type ProjectionResult<T, P extends TrustProjections<T>> = ReturnType<
  NonNullable<P['metadata-only'] | P['redacted'] | P['partial'] | P['full'] | P['subgraph']>
>

/**
 * Governance levels that surface ONLY at trust level 'full'.
 *
 * CANONICAL as of @0.16.0 — this boundary decision was converged on
 * independently in the field (web-activity 836e425 ⇄ project-control 7633aa7,
 * same night, cross-referenced) and is absorbed here so every connector's read
 * surface agrees: a 'partial'-level caller sees the same governance projection
 * at every boundary in the stack.
 *
 *   - 'client'             — the hard firewall. Never cross-syncs into Threshold.
 *   - 'personal-sensitive' — the privacy floor.
 *
 * 'subgraph' does NOT cross this line: a caller-specified filter is a shape
 * grant, not a sensitivity grant. Only exactly 'full' surfaces sensitive entries.
 */
export const SENSITIVE_GOVERNANCE: ReadonlySet<string> = new Set<Governance>([
  'client',
  'personal-sensitive',
])

/** Is an entry with this governance visible to a caller at this trust level?
 *  Sensitive governance ⇒ only at exactly 'full'. Everything else ⇒ always. */
export function governanceVisibleAt(
  governance: Governance | string,
  trustLevel: TrustLevel | string
): boolean {
  return SENSITIVE_GOVERNANCE.has(governance) ? trustLevel === 'full' : true
}

/** Filter a collection to what is visible BELOW 'full' — sensitive entries
 *  (client + personal-sensitive) removed structurally, so a downward fallback
 *  inside projectByTrust can never leak one. Use inside every projection rung
 *  except 'full':
 *
 *    projectByTrust(entries, trustLevel, {
 *      'metadata-only': (all) => summarize(filterSensitive(all)),
 *      partial: (all) => filterSensitive(all),
 *      full: (all) => all,   // the ONLY rung that crosses the line
 *    })
 */
export function filterSensitive<T extends { governance: Governance | string }>(items: T[]): T[] {
  return items.filter((item) => !SENSITIVE_GOVERNANCE.has(item.governance))
}

export class TrustProjectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrustProjectionError'
  }
}

/**
 * Project `data` for a caller holding `trustLevel`.
 *
 * Fallback is strictly downward: if the exact level has no projection, the
 * next more restrictive defined projection is used. It is impossible to
 * receive a projection more permissive than the credential's level.
 *
 * 'subgraph' requires an explicit projection (it interprets caller params);
 * requesting it without one throws TrustProjectionError rather than guessing.
 */
export function projectByTrust<T, P extends TrustProjections<T>>(
  data: T,
  trustLevel: TrustLevel | string,
  projections: P,
  subgraphParams?: unknown
): ProjectionResult<T, P> {
  type Result = ProjectionResult<T, P>
  if (trustLevel === 'subgraph') {
    if (!projections.subgraph) {
      throw new TrustProjectionError(
        "credential grants 'subgraph' but no subgraph projection is defined — define one (it must interpret caller params); there is no safe automatic fallback"
      )
    }
    return projections.subgraph(data, subgraphParams) as Result
  }

  const startIdx = TRUST_LEVEL_LADDER.indexOf(trustLevel as LadderTrustLevel)
  if (startIdx === -1) {
    throw new TrustProjectionError(
      `unknown trust level '${trustLevel}' — refusing to project (levels: ${TRUST_LEVEL_LADDER.join(', ')}, subgraph)`
    )
  }

  // Walk DOWN the ladder from the granted level to the safe floor.
  for (let i = startIdx; i >= 0; i--) {
    const projection = projections[TRUST_LEVEL_LADDER[i]]
    if (projection) return projection(data) as Result
  }

  // Unreachable: 'metadata-only' is required by the type.
  throw new TrustProjectionError('no projection defined — metadata-only is required')
}
