/**
 * Pure-logic tests: registryMarkdown rendering.
 * Run: npm test (node --test over dist/__tests__).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { registryMarkdown, type RegisteredCapability } from '../capability.js'

function cap(overrides: Partial<RegisteredCapability>): RegisteredCapability {
  return {
    id: 'row-1',
    capabilityId: 'example',
    name: 'Example',
    type: 'connector',
    canonicalFor: null,
    trustLevel: 'partial',
    minimumTrust: 'friend',
    endpoint: null,
    status: 'active',
    adherenceScore: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    declaration: null,
    ...overrides,
  }
}

test('renders active capabilities as table rows', () => {
  const md = registryMarkdown([
    cap({
      capabilityId: 'local-inference',
      declaration: {
        id: 'local-inference',
        name: 'Local Inference',
        description: 'Expose local LLMs.',
        trustLevel: 'full',
        minimumTrust: 'friend',
      },
    }),
  ])
  assert.match(md, /check before building/)
  assert.match(md, /\| `local-inference` \| connector \| partial\/friend \| Expose local LLMs\. \|/)
})

test('filters non-active capabilities', () => {
  const md = registryMarkdown([
    cap({ capabilityId: 'gone', status: 'paused' }),
    cap({ capabilityId: 'here' }),
  ])
  assert.doesNotMatch(md, /`gone`/)
  assert.match(md, /`here`/)
})

test('falls back to name when declaration is missing, and annotates deps', () => {
  const md = registryMarkdown([
    cap({ capabilityId: 'bare', name: 'Bare Name', declaration: null }),
    cap({
      capabilityId: 'composed',
      declaration: {
        id: 'composed',
        name: 'Composed',
        description: 'Needs auth.',
        trustLevel: 'partial',
        minimumTrust: 'friend',
        requiredCapabilities: ['oauth-connect'],
      },
    }),
  ])
  assert.match(md, /\| `bare` \| connector \| partial\/friend \| Bare Name \|/)
  assert.match(md, /Needs auth\. \(requires: oauth-connect\)/)
})

test('null type renders as em dash', () => {
  const md = registryMarkdown([cap({ capabilityId: 'untyped', type: null })])
  assert.match(md, /\| `untyped` \| — \|/)
})
