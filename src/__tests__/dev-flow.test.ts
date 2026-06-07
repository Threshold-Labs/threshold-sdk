/**
 * End-to-end: the trust-gated flow against threshold-dev, cold.
 * This is the cold-start audit's "differentiated thing", as a permanent test:
 * declare → list → resolve → trust-gated credential → cryptographic verify,
 * plus the negative paths (gate refusal, tampered signature, wrong audience).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { createDevServer, devVerifyOptions, type DevServerHandle } from '../dev-server.js'
import {
  declareCapability,
  listCapabilities,
  resolveCapability,
  requestDataAccess,
} from '../capability.js'
import { gateDataRequest, verifyDataCredential, VaultCredentialError } from '../vault.js'
import { serveVault } from '../serve.js'

const PORT = 8798
const ALICE = 'thld_dev_alice'
const BOB = 'thld_dev_bob'

let dev: DevServerHandle
let baseUrl: string

before(async () => {
  dev = await createDevServer({ port: PORT })
  baseUrl = dev.issuer

  await declareCapability(
    {
      id: 'interest-graph',
      name: 'Interest Graph',
      description: 'Per-person interest profiles.',
      type: 'graph',
      trustLevel: 'partial',
      minimumTrust: 'friend',
      endpoint: 'http://localhost:4040',
    },
    { token: ALICE, baseUrl }
  )
  await declareCapability(
    {
      id: 'reading-history',
      name: 'Reading History',
      description: 'Reading corpus.',
      trustLevel: 'full',
      minimumTrust: 'close',
    },
    { token: ALICE, baseUrl }
  )
})

after(async () => {
  await dev.close()
})

test('owner lists her registry in normalized form', async () => {
  const caps = await listCapabilities({ token: ALICE, baseUrl })
  const ids = caps.map((c) => c.capabilityId).sort()
  assert.deepEqual(ids, ['interest-graph', 'reading-history'])
  const ig = caps.find((c) => c.capabilityId === 'interest-graph')
  assert.equal(ig?.declaration?.description, 'Per-person interest profiles.')
})

test('peer resolves at the declared trust level; owner resolves at full', async () => {
  const asBob = await resolveCapability('interest-graph', { token: BOB, baseUrl })
  assert.equal(asBob?.trustLevel, 'partial')
  assert.equal(asBob?.endpoint, 'http://localhost:4040')
  const asAlice = await resolveCapability('interest-graph', { token: ALICE, baseUrl })
  assert.equal(asAlice?.trustLevel, 'full')
})

test('trust-gated credential verifies cryptographically against the dev key', async () => {
  const access = await requestDataAccess('interest-graph', { token: BOB, baseUrl })
  assert.equal(access.trustLevel, 'partial')
  assert.match(access.credential, /^thld_va_/)

  const payload = await verifyDataCredential(access.credential, {
    audience: 'interest-graph',
    publicJwk: dev.jwk,
    issuer: dev.issuer,
  })
  assert.equal(payload.grantee, 'user:bob')
  assert.equal(payload.ownerId, 'user:alice')
  assert.equal(payload.trustLevel, 'partial')
})

test('trust gate refuses below-tier requests (friend < close)', async () => {
  await assert.rejects(
    requestDataAccess('reading-history', { token: BOB, baseUrl }),
    /trust gate/
  )
})

test('tampered credential fails signature verification', async () => {
  const access = await requestDataAccess('interest-graph', { token: BOB, baseUrl })
  const tampered = access.credential.slice(0, -6) + 'AAAAAA'
  await assert.rejects(
    verifyDataCredential(tampered, {
      audience: 'interest-graph',
      publicJwk: dev.jwk,
      issuer: dev.issuer,
    }),
    VaultCredentialError
  )
})

test('credential is audience-scoped', async () => {
  const access = await requestDataAccess('interest-graph', { token: BOB, baseUrl })
  await assert.rejects(
    verifyDataCredential(access.credential, {
      audience: 'some-other-capability',
      publicJwk: dev.jwk,
      issuer: dev.issuer,
    }),
    /not scoped to this capability/
  )
})

test('unknown token is refused', async () => {
  await assert.rejects(
    listCapabilities({ token: 'thld_dev_mallory', baseUrl }),
    /Unauthorized/
  )
})

test('createDevServer defaults to 8787 when no port option and no PORT env (the bare `npx threshold-dev` path)', async () => {
  // Regression: `Number(undefined) ?? 8787` stays NaN (NaN is not nullish) —
  // bare `npx threshold-dev` crashed on listen(NaN). Published broken in 0.17.2.
  const savedPort = process.env.PORT
  delete process.env.PORT
  try {
    const bare = await createDevServer()
    assert.equal(bare.port, 8787)
    assert.equal(bare.issuer, 'http://localhost:8787')
    await bare.close()
  } finally {
    if (savedPort !== undefined) process.env.PORT = savedPort
  }
})

test('devVerifyOptions fetches the dev key — equivalent to handle.jwk/issuer', async () => {
  const verify = await devVerifyOptions(dev.issuer)
  assert.equal(verify.issuer, dev.issuer)
  assert.deepEqual(verify.publicJwk, dev.jwk)
})

test('gateDataRequest: the non-throwing capability front door', async () => {
  const access = await requestDataAccess('interest-graph', { token: BOB, baseUrl })
  const verify = await devVerifyOptions(dev.issuer)

  // Missing header → 401, no throw.
  const missing = await gateDataRequest(undefined, { audience: 'interest-graph', ...verify })
  assert.deepEqual(missing, { ok: false, status: 401, error: 'this endpoint requires a thld_va_ data credential' })

  // Tampered credential → 401, no throw.
  const tampered = await gateDataRequest(`Bearer ${access.credential.slice(0, -6)}AAAAAA`, {
    audience: 'interest-graph',
    ...verify,
  })
  assert.equal(tampered.ok, false)

  // Valid credential (with the Bearer prefix, as it arrives on the wire) → payload.
  const gate = await gateDataRequest(`Bearer ${access.credential}`, { audience: 'interest-graph', ...verify })
  assert.ok(gate.ok)
  assert.equal(gate.payload.trustLevel, 'partial')
  assert.equal(gate.payload.grantee, 'user:bob')
})

test('serveVault: the one-call capability server — gate + projection, cold', async () => {
  const graph = {
    nodes: [{ id: 'p1', name: 'Gia', weight: 0.873 }, { id: 'p2', name: 'Dustin', weight: 0.412 }],
  }
  const vault = await serveVault({
    audience: 'interest-graph',
    port: 0, // ephemeral
    publicJwk: dev.jwk,
    issuer: dev.issuer,
    getData: () => graph,
    projections: {
      'metadata-only': (g) => ({ people: g.nodes.length }),
      partial: (g) => ({ nodes: g.nodes.map((n) => ({ id: n.id, weight: Math.round(n.weight * 10) / 10 })) }),
      full: (g) => g,
    },
  })
  try {
    // Bare request → 401.
    assert.equal((await fetch(vault.url)).status, 401)

    // /health is open.
    const health = (await fetch(`http://localhost:${vault.port}/health`).then((r) => r.json())) as {
      healthy: boolean
      capability: string
    }
    assert.equal(health.healthy, true)
    assert.equal(health.capability, 'interest-graph')

    // friend-tier caller gets the partial projection — names never cross.
    const access = await requestDataAccess('interest-graph', { token: BOB, baseUrl })
    const res = await fetch(vault.url, { headers: { Authorization: `Bearer ${access.credential}` } })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { nodes: Array<{ id: string; weight: number }> }
    assert.deepEqual(body, { nodes: [{ id: 'p1', weight: 0.9 }, { id: 'p2', weight: 0.4 }] })
    assert.doesNotMatch(JSON.stringify(body), /Gia|Dustin|0\.873/)

    // Owner reads full.
    const owner = await requestDataAccess('interest-graph', { token: ALICE, baseUrl })
    const fullBody = (await fetch(vault.url, {
      headers: { Authorization: `Bearer ${owner.credential}` },
    }).then((r) => r.json())) as typeof graph
    assert.deepEqual(fullBody, graph)
  } finally {
    await vault.close()
  }
})
