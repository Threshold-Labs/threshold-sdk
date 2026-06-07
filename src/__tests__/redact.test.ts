/**
 * projectByTrust — fall-down semantics. The property under test: a caller can
 * NEVER receive a projection more permissive than their credential's level.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  filterSensitive,
  governanceVisibleAt,
  projectByTrust,
  SENSITIVE_GOVERNANCE,
  TrustProjectionError,
} from '../redact.js'

interface Graph {
  nodes: string[]
  weights: number[]
}

const graph: Graph = { nodes: ['gia', 'dustin'], weights: [0.91, 0.42] }

const fullSet = {
  'metadata-only': (g: Graph) => ({ count: g.nodes.length }),
  redacted: (g: Graph) => ({ nodes: g.nodes.map((_, i) => `node-${i}`), weights: g.weights }),
  partial: (g: Graph) => ({ nodes: g.nodes, weights: g.weights.map((w) => Math.round(w * 10) / 10) }),
  full: (g: Graph) => g,
}

test('exact level is used when defined', () => {
  assert.deepEqual(projectByTrust(graph, 'metadata-only', fullSet), { count: 2 })
  assert.deepEqual(projectByTrust(graph, 'full', fullSet), graph)
  assert.deepEqual(projectByTrust(graph, 'partial', fullSet), {
    nodes: ['gia', 'dustin'],
    weights: [0.9, 0.4],
  })
})

test('undefined level falls DOWN to the next more restrictive projection', () => {
  const sparse = {
    'metadata-only': (g: Graph) => ({ count: g.nodes.length }),
    full: (g: Graph) => g,
  }
  // partial undefined, redacted undefined → metadata-only. Never up to full.
  assert.deepEqual(projectByTrust(graph, 'partial', sparse), { count: 2 })
  assert.deepEqual(projectByTrust(graph, 'redacted', sparse), { count: 2 })
  assert.deepEqual(projectByTrust(graph, 'full', sparse), graph)
})

test('subgraph requires an explicit projection', () => {
  assert.throws(() => projectByTrust(graph, 'subgraph', fullSet), TrustProjectionError)
  const withSubgraph = {
    ...fullSet,
    subgraph: (g: Graph, params?: unknown) => {
      const { only } = (params ?? {}) as { only?: string }
      return { nodes: g.nodes.filter((n) => n === only) }
    },
  }
  assert.deepEqual(projectByTrust(graph, 'subgraph', withSubgraph, { only: 'gia' }), {
    nodes: ['gia'],
  })
})

test('unknown trust level refuses to project', () => {
  assert.throws(() => projectByTrust(graph, 'admin', fullSet), /unknown trust level 'admin'/)
})

// ── Sensitive-governance boundary (canonical as of 0.16.0) ──────────────────

const entries = [
  { id: 'a', governance: 'open' },
  { id: 'b', governance: 'internal' },
  { id: 'c', governance: 'client' },
  { id: 'd', governance: 'personal-sensitive' },
  { id: 'e', governance: 'research' },
]

test('sensitive governance is visible ONLY at exactly full', () => {
  for (const g of SENSITIVE_GOVERNANCE) {
    assert.equal(governanceVisibleAt(g, 'full'), true)
    for (const level of ['metadata-only', 'redacted', 'partial', 'subgraph']) {
      assert.equal(governanceVisibleAt(g, level), false, `${g} must be hidden at ${level}`)
    }
  }
  // Non-sensitive governance is visible everywhere.
  assert.equal(governanceVisibleAt('open', 'metadata-only'), true)
  assert.equal(governanceVisibleAt('internal', 'redacted'), true)
})

test('filterSensitive removes client + personal-sensitive, keeps the rest', () => {
  assert.deepEqual(
    filterSensitive(entries).map((e) => e.id),
    ['a', 'b', 'e']
  )
})

test('filterSensitive inside projection rungs: downward fallback cannot leak', () => {
  const projections = {
    'metadata-only': (all: typeof entries) => ({ count: filterSensitive(all).length }),
    partial: (all: typeof entries) => filterSensitive(all).map((e) => e.id),
    full: (all: typeof entries) => all.map((e) => e.id),
  }
  // partial-level caller never sees c/d
  assert.deepEqual(projectByTrust(entries, 'partial', projections), ['a', 'b', 'e'])
  // redacted undefined → falls DOWN to metadata-only, still sensitive-free
  assert.deepEqual(projectByTrust(entries, 'redacted', projections), { count: 3 })
  // only full crosses the line
  assert.deepEqual(projectByTrust(entries, 'full', projections), ['a', 'b', 'c', 'd', 'e'])
})
