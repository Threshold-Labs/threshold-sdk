/**
 * End-to-end: the trust-gated flow against threshold-dev, cold.
 * This is the cold-start audit's "differentiated thing", as a permanent test:
 * declare → list → resolve → trust-gated credential → cryptographic verify,
 * plus the negative paths (gate refusal, tampered signature, wrong audience).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { createDevServer, type DevServerHandle } from '../dev-server.js'
import {
  declareCapability,
  listCapabilities,
  resolveCapability,
  requestDataAccess,
} from '../capability.js'
import { verifyDataCredential, VaultCredentialError } from '../vault.js'

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
