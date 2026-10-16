/**
 * Region spec — the three capability stories.
 *
 * Story 1: actor-region      — actor space with permeable boundary
 * Story 2: topic-actor-map   — derivative region composing actor-region + topic signals
 * Story 3: region-drift-watch — monitoring primitive declared as a stub; promoted live
 *
 * Core invariants:
 *   - Trust is permeability, not a disclosed tier. Grantees experience what they can reach.
 *   - Stubs are first-class: declared without an endpoint, grantable immediately.
 *   - Grants survive stub promotion — no re-granting when an endpoint is added.
 *   - Composition is declared in the capability; consumers compose, don't rebuild.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { createDevServer, type DevServerHandle } from '../dev-server.js'
import {
  declareCapability,
  listCapabilities,
  resolveCapability,
  requestDataAccess,
  registryMarkdown,
  type RegisteredCapability,
} from '../capability.js'
import { serveVault } from '../serve.js'

const PORT = 8801
const ALICE = 'thld_dev_alice'  // owns the capabilities
const BOB   = 'thld_dev_bob'    // trusted at 'friend' — meets 'friend' minimum

let dev: DevServerHandle
let baseUrl: string

before(async () => {
  dev = await createDevServer({ port: PORT })
  baseUrl = dev.issuer

  await declareCapability(
    {
      id: 'actor-region',
      name: 'Actor Region',
      description: 'Grouped actors with relationship metadata.',
      type: 'graph',
      ownerType: 'user',
      trustLevel: 'partial',
      minimumTrust: 'friend',
      cadence: { expected: 'on-demand' },
    },
    { token: ALICE, baseUrl }
  )

  await declareCapability(
    {
      id: 'topic-actor-map',
      name: 'Topic-Actor Map',
      description: 'Maps actors to topics based on inferred interests.',
      type: 'signal',
      ownerType: 'user',
      trustLevel: 'partial',
      minimumTrust: 'friend',
      composedOf: ['actor-region'],
      requiredCapabilities: ['actor-region'],
      cadence: { expected: 'P1D', window: 'PT6H' },
    },
    { token: ALICE, baseUrl }
  )

  // Story 3: declared stub — no endpoint yet
  await declareCapability(
    {
      id: 'region-drift-watch',
      name: 'Region Drift Watch',
      description: 'Detects foundational changes in a region (membership, cadence, complexity) and surfaces review moments.',
      type: 'derivation',
      ownerType: 'app',
      trustLevel: 'metadata-only',
      minimumTrust: 'acquaintance',
      cadence: { expected: 'on-demand' },
    },
    { token: ALICE, baseUrl }
  )
})

after(async () => {
  await dev.close()
})

// ── Story 1: Actor region permeability ───────────────────────────────────────

type Actor = {
  id: string
  name: string
  tags: string[]
  weight: number
  privateNote?: string
}

const actors: Actor[] = [
  { id: 'a1', name: 'Gia',    tags: ['design', 'research'], weight: 0.91, privateNote: 'best source on typography' },
  { id: 'a2', name: 'Dustin', tags: ['engineering'],        weight: 0.42, privateNote: 'slow responder'            },
]

const actorProjections = {
  'metadata-only': (g: Actor[]) => ({
    count: g.length,
    clusterSignature: [...new Set(g.flatMap(a => a.tags))].sort().join(','),
  }),
  partial: (g: Actor[]) =>
    g.map(a => ({ id: a.id, name: a.name, tags: a.tags, weight: Math.round(a.weight * 10) / 10 })),
  full: (g: Actor[]) => g,
}

test('actor-region: owner resolves at full; peer resolves at declared trust level', async () => {
  const asAlice = await resolveCapability('actor-region', { token: ALICE, baseUrl })
  const asBob   = await resolveCapability('actor-region', { token: BOB,   baseUrl })

  assert.equal(asAlice?.trustLevel, 'full')
  assert.equal(asBob?.trustLevel,   'partial')
})

test('actor-region: partial projection — names and tags visible, private notes never cross', async () => {
  const vault = await serveVault({
    audience: 'actor-region',
    port: 0,
    publicJwk: dev.jwk,
    issuer:    dev.issuer,
    getData:   () => actors,
    projections: actorProjections,
  })

  try {
    const access = await requestDataAccess('actor-region', { token: BOB, baseUrl })
    const body = await fetch(vault.url, {
      headers: { Authorization: `Bearer ${access.credential}` },
    }).then(r => r.json()) as Array<{ id: string; name: string; tags: string[]; weight: number }>

    assert.equal(body.length, 2)
    assert.equal(body[0].name, 'Gia')
    // Weights are rounded — exact floats from private data do not leak
    assert.doesNotMatch(JSON.stringify(body), /0\.91|0\.42/)
    // Private notes are absent at partial
    assert.doesNotMatch(JSON.stringify(body), /privateNote|best source|slow responder/)
  } finally {
    await vault.close()
  }
})

test('actor-region: full projection — owner sees private notes', async () => {
  const vault = await serveVault({
    audience: 'actor-region',
    port: 0,
    publicJwk: dev.jwk,
    issuer:    dev.issuer,
    getData:   () => actors,
    projections: actorProjections,
  })

  try {
    const access = await requestDataAccess('actor-region', { token: ALICE, baseUrl })
    const body = await fetch(vault.url, {
      headers: { Authorization: `Bearer ${access.credential}` },
    }).then(r => r.json()) as Actor[]

    assert.equal(body[0].privateNote, 'best source on typography')
    assert.equal(body[1].privateNote, 'slow responder')
  } finally {
    await vault.close()
  }
})

test('actor-region: metadata-only projection — count and cluster signature only, no identities', async () => {
  const vault = await serveVault({
    audience: 'actor-region',
    port: 0,
    publicJwk: dev.jwk,
    issuer:    dev.issuer,
    getData:   () => actors,
    projections: actorProjections,
  })

  try {
    // Bob requests at partial, but metadata-only is a valid fall-down target
    // to test shape-only via projectByTrust directly
    const { projectByTrust } = await import('../redact.js')
    const shape = projectByTrust(actors, 'metadata-only', actorProjections) as {
      count: number
      clusterSignature: string
    }

    assert.equal(shape.count, 2)
    assert.ok(shape.clusterSignature.includes('design'))
    // No identities cross the metadata-only boundary
    assert.doesNotMatch(JSON.stringify(shape), /Gia|Dustin/)
  } finally {
    await vault.close()
  }
})

// ── Story 2: Region composition ──────────────────────────────────────────────

test('topic-actor-map: composition and required capabilities preserved in declaration', async () => {
  const caps = await listCapabilities({ token: ALICE, baseUrl })
  const tam = caps.find(c => c.capabilityId === 'topic-actor-map')

  assert.ok(tam, 'topic-actor-map in registry')
  assert.deepEqual(tam?.declaration?.composedOf,           ['actor-region'])
  assert.deepEqual(tam?.declaration?.requiredCapabilities, ['actor-region'])
})

test('topic-actor-map: cadence contract (theoretical) preserved in registry', async () => {
  const caps = await listCapabilities({ token: ALICE, baseUrl })
  const tam  = caps.find(c => c.capabilityId === 'topic-actor-map')

  assert.ok(tam?.declaration?.cadence, 'cadence present')
  assert.equal(tam?.declaration?.cadence?.expected, 'P1D')
  assert.equal(tam?.declaration?.cadence?.window,   'PT6H')
})

test('registryMarkdown: composed capability lists its required deps', () => {
  const mock: RegisteredCapability[] = [
    {
      id: 'r1', capabilityId: 'actor-region', name: 'Actor Region',
      type: 'graph', canonicalFor: null, trustLevel: 'partial', minimumTrust: 'friend',
      endpoint: null, status: 'active', adherenceScore: null, createdAt: '', updatedAt: '',
      declaration: {
        id: 'actor-region', name: 'Actor Region', description: 'Grouped actors.',
        trustLevel: 'partial', minimumTrust: 'friend',
      },
    },
    {
      id: 'r2', capabilityId: 'topic-actor-map', name: 'Topic-Actor Map',
      type: 'signal', canonicalFor: null, trustLevel: 'partial', minimumTrust: 'friend',
      endpoint: null, status: 'active', adherenceScore: null, createdAt: '', updatedAt: '',
      declaration: {
        id: 'topic-actor-map', name: 'Topic-Actor Map',
        description: 'Topic associations for actors.',
        trustLevel: 'partial', minimumTrust: 'friend',
        requiredCapabilities: ['actor-region'],
      },
    },
  ]

  const md = registryMarkdown(mock)
  assert.match(md, /topic-actor-map/)
  assert.match(md, /requires: actor-region/)
})

// ── Story 3: Stub lifecycle ───────────────────────────────────────────────────

test('region-drift-watch: stub is active and resolvable before endpoint is set', async () => {
  const resolved = await resolveCapability('region-drift-watch', { token: BOB, baseUrl })

  assert.ok(resolved,                    'stub is resolvable')
  assert.equal(resolved?.status,         'active')
  assert.equal(resolved?.endpoint,       null)
  assert.equal(resolved?.trustLevel,     'metadata-only')
})

test('region-drift-watch: stub is grantable — credential issued with null endpoint', async () => {
  const access = await requestDataAccess('region-drift-watch', { token: BOB, baseUrl })

  assert.match(access.credential, /^thld_va_/)
  assert.equal(access.endpoint,   null)
  assert.equal(access.trustLevel, 'metadata-only')
})

test('region-drift-watch: grant survives stub promotion — no re-grant needed', async () => {
  // Before promotion: credential works, no endpoint
  const before = await requestDataAccess('region-drift-watch', { token: BOB, baseUrl })
  assert.equal(before.endpoint, null)

  // Promote: re-declare with endpoint (idempotent upsert)
  await declareCapability(
    {
      id: 'region-drift-watch',
      name: 'Region Drift Watch',
      description: 'Detects foundational changes in a region (membership, cadence, complexity) and surfaces review moments.',
      type: 'derivation',
      ownerType: 'app',
      trustLevel: 'metadata-only',
      minimumTrust: 'acquaintance',
      endpoint: 'http://localhost:9090/drift',
      cadence: { expected: 'on-demand' },
    },
    { token: ALICE, baseUrl }
  )

  // Same caller, same trust — credential still issued, endpoint now known
  const after = await requestDataAccess('region-drift-watch', { token: BOB, baseUrl })
  assert.match(after.credential,   /^thld_va_/)
  assert.equal(after.endpoint,     'http://localhost:9090/drift')
  assert.equal(after.trustLevel,   'metadata-only')  // trust level unchanged by promotion

  // Owner resolution confirms endpoint
  const resolved = await resolveCapability('region-drift-watch', { token: ALICE, baseUrl })
  assert.equal(resolved?.endpoint, 'http://localhost:9090/drift')
})

// ── Cross-cutting: trust is physics ──────────────────────────────────────────

test('grantee does not learn the grantor\'s explicit trust tier — only experiences permeability', async () => {
  // Bob gets the capability's declared trust level — not a message about the relationship.
  const resolved = await resolveCapability('actor-region', { token: BOB, baseUrl })
  assert.equal(resolved?.trustLevel, 'partial')

  // No field discloses "you are trusted as 'friend'"
  const r = resolved as unknown as Record<string, unknown>
  assert.equal(r['yourTrustTier'],      undefined)
  assert.equal(r['grantorTrustsYouAs'], undefined)
  assert.equal(r['trustRelationship'],  undefined)
})

test('owner self-resolves at full regardless of declared trust level', async () => {
  const resolved = await resolveCapability('actor-region', { token: ALICE, baseUrl })
  assert.equal(resolved?.trustLevel, 'full')
})

// ── Not yet testable ─────────────────────────────────────────────────────────
//
// These contracts are part of the spec but require infra not yet in the dev server:
//
// - Drift trigger: when membership/cadence/complexity diverges from theoretical
//   baseline, a review_moment event is emitted. Requires a drift compute layer
//   that watches the region and measures adherenceScore over time.
//
// - Adjacent region shape preview: a grantee can see the outline (count, type)
//   of regions they cannot enter, and request access. Requires cross-user region
//   discovery endpoint (GET /api/users/:id/regions — not yet implemented).
//
// - Sweep grants on clusters: grant access to all actors in a detected community
//   cluster. Requires explicit P2P grant model (POST /api/capabilities/:id/grants
//   with granteeType:'user') and cluster metadata in the region declaration.
//
// - User-to-user grant token: POST /api/capabilities/:id/grants with
//   granteeType:'user' does not yet issue a thld_cg_ token. ~20 lines in
//   worker.ts. Once implemented, BOB would receive a token to present instead
//   of having his trust tier checked inline.
