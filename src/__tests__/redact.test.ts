/**
 * projectByTrust — fall-down semantics. The property under test: a caller can
 * NEVER receive a projection more permissive than their credential's level.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { projectByTrust, TrustProjectionError } from '../redact.js'

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
