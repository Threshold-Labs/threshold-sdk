/**
 * Pool primitives — membership from trust edges, consent exclusion, pool gate.
 *
 * Core invariants:
 *   - Membership IS the graph: anchor-rooted edges at/above minimumTrust, no member table.
 *   - Revocation is graph-native: a still-valid credential fails the gate once the edge is gone.
 *   - Consent is a separate axis: opted-out members keep access; their content stops being served.
 *   - Err closed everywhere: unknown tiers never clear, unattributable content drops.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { createDevServer, type DevServerHandle } from '../dev-server.js'
import { declareCapability, requestDataAccess } from '../capability.js'
import {
  MINIMUM_TRUST_ORDER,
  trustAtLeast,
  derivePoolMembership,
  poolCapabilityDeclaration,
  isOptedOut,
  filterOptedOut,
  gatePoolRequest,
  type PoolDeclaration,
  type TrustEdge,
  type OptOutRecord,
} from '../pool.js'

const POOL: PoolDeclaration = {
  id: 'dev-pool',
  name: 'Dev Pool',
  description: 'Test pool anchored at alice.',
  anchorId: 'user:alice',
  minimumTrust: 'colleague',
  capabilities: ['pool-brain'],
}

const EDGES: TrustEdge[] = [
  { from: 'user:alice', to: 'user:bob', tier: 'friend' },
  { from: 'user:alice', to: 'user:carol', tier: 'colleague' },
  { from: 'user:alice', to: 'user:dave', tier: 'acquaintance' }, // below minimum
  { from: 'user:bob', to: 'user:eve', tier: 'partner' },         // not anchor-rooted
]

// ── Trust ladder ─────────────────────────────────────────────────────────────

test('trustAtLeast walks the ladder; unknown tiers never clear', () => {
  assert.equal(trustAtLeast('friend', 'colleague'), true)
  assert.equal(trustAtLeast('colleague', 'colleague'), true)
  assert.equal(trustAtLeast('acquaintance', 'colleague'), false)
  assert.equal(trustAtLeast(undefined, 'acquaintance'), false)
  assert.equal(trustAtLeast('superuser', 'acquaintance'), false) // err closed
  assert.equal(MINIMUM_TRUST_ORDER[0], 'acquaintance')
  assert.equal(MINIMUM_TRUST_ORDER[MINIMUM_TRUST_ORDER.length - 1], 'partner')
})

// ── Membership derivation ────────────────────────────────────────────────────

test('membership = anchor-rooted edges at/above minimumTrust, plus the anchor', () => {
  const members = derivePoolMembership(POOL, EDGES)
  const ids = members.map((m) => m.memberId).sort()
  assert.deepEqual(ids, ['user:alice', 'user:bob', 'user:carol'])
  // dave below minimum, eve not anchor-rooted — trust is not transitive here
})

test('revocation = the same derivation after the edge changed', () => {
  const revoked = EDGES.filter((e) => e.to !== 'user:bob')
  const ids = derivePoolMembership(POOL, revoked).map((m) => m.memberId)
  assert.ok(!ids.includes('user:bob'))
})

test('duplicate edges keep the highest tier', () => {
  const members = derivePoolMembership(POOL, [
    ...EDGES,
    { from: 'user:alice', to: 'user:carol', tier: 'close' },
  ])
  const carol = members.find((m) => m.memberId === 'user:carol')
  assert.equal(carol?.tier, 'close')
})

// ── Consent / opt-out ────────────────────────────────────────────────────────

const OPT_OUTS: OptOutRecord[] = [
  { memberId: 'user:carol', scope: 'index', recordedAt: '2026-08-05T00:00:00Z' },
  { memberId: 'user:bob', scope: 'all', recordedAt: '2026-08-05T00:00:00Z' },
]

test('isOptedOut scopes: index-only opt-out does not cover artifact; all covers both', () => {
  assert.equal(isOptedOut('user:carol', OPT_OUTS, 'index'), true)
  assert.equal(isOptedOut('user:carol', OPT_OUTS, 'artifact'), false)
  assert.equal(isOptedOut('user:bob', OPT_OUTS, 'index'), true)
  assert.equal(isOptedOut('user:bob', OPT_OUTS, 'artifact'), true)
  assert.equal(isOptedOut('user:alice', OPT_OUTS, 'index'), false)
})

test('filterOptedOut excludes withdrawn content and drops unattributable by default', () => {
  const items = [
    { sharer: 'user:alice', link: 'a' },
    { sharer: 'user:bob', link: 'b' },       // opted out (all)
    { sharer: 'user:carol', link: 'c' },     // opted out of index only
    { sharer: null, link: 'd' },             // unattributable
  ]
  const forIndex = filterOptedOut(items, OPT_OUTS, {
    surface: 'index',
    memberIdOf: (i) => i.sharer,
  })
  assert.deepEqual(forIndex.map((i) => i.link), ['a'])

  const forArtifact = filterOptedOut(items, OPT_OUTS, {
    surface: 'artifact',
    memberIdOf: (i) => i.sharer,
  })
  assert.deepEqual(forArtifact.map((i) => i.link), ['a', 'c'])

  const keepUnattributed = filterOptedOut(items, OPT_OUTS, {
    surface: 'index',
    memberIdOf: (i) => i.sharer,
    unattributed: 'keep',
  })
  assert.deepEqual(keepUnattributed.map((i) => i.link), ['a', 'd'])
})

// ── Pool gate (end-to-end against threshold-dev) ─────────────────────────────

const PORT = 8802
let dev: DevServerHandle

before(async () => {
  dev = await createDevServer({ port: PORT })
  // alice declares the pool's capability — the declared/consumed bridge.
  await declareCapability(
    poolCapabilityDeclaration(POOL, {
      id: 'pool-brain',
      name: 'Pool Brain',
      description: 'Trust-gated pool knowledge surface.',
      trustLevel: 'partial',
    }),
    { token: 'thld_dev_alice', baseUrl: dev.issuer }
  )
})

after(async () => {
  await dev.close()
})

test('gate passes for a member holding a valid credential', async () => {
  // bob is trusted at friend (dev seed), pool minimum is colleague — issuance flows from the graph
  const access = await requestDataAccess('pool-brain', { token: 'thld_dev_bob', baseUrl: dev.issuer })
  const result = await gatePoolRequest(`Bearer ${access.credential}`, {
    pool: POOL,
    edges: EDGES,
    audience: 'pool-brain',
    publicJwk: dev.jwk,
    issuer: dev.issuer,
  })
  assert.ok(result.ok)
  assert.equal(result.member.memberId, 'user:bob')
  assert.equal(result.payload.trustLevel, 'partial')
})

test('revocation is graph-native: same valid credential, edge removed → 403', async () => {
  const access = await requestDataAccess('pool-brain', { token: 'thld_dev_bob', baseUrl: dev.issuer })
  const result = await gatePoolRequest(`Bearer ${access.credential}`, {
    pool: POOL,
    edges: EDGES.filter((e) => e.to !== 'user:bob'),
    audience: 'pool-brain',
    publicJwk: dev.jwk,
    issuer: dev.issuer,
  })
  assert.ok(!result.ok)
  assert.equal(result.status, 403)
})

test('missing or garbage credential is still a 401, before membership is consulted', async () => {
  const missing = await gatePoolRequest(undefined, {
    pool: POOL, edges: EDGES, audience: 'pool-brain', publicJwk: dev.jwk, issuer: dev.issuer,
  })
  assert.ok(!missing.ok)
  assert.equal(missing.status, 401)

  const garbage = await gatePoolRequest('Bearer thld_va_not.a.credential', {
    pool: POOL, edges: EDGES, audience: 'pool-brain', publicJwk: dev.jwk, issuer: dev.issuer,
  })
  assert.ok(!garbage.ok)
  assert.equal(garbage.status, 401)
})
