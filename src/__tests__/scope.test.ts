/**
 * Pure-logic tests: scopeSatisfies (#63 scope convention).
 * Run: npm test (node --test over dist/__tests__).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { scopeSatisfies } from '../vault.js'
import { scopeSatisfies as fromRoot } from '../index.js'

test('exact match satisfies', () => {
  assert.equal(scopeSatisfies('reading:read', 'reading:read'), true)
  assert.equal(scopeSatisfies('edges:read:current', 'edges:read:current'), true)
})

test('broader grant satisfies a qualified requirement', () => {
  assert.equal(scopeSatisfies('reading:read', 'reading:read:current'), true)
  assert.equal(scopeSatisfies('edges:read', 'edges:read:historical'), true)
})

test('narrower grant never satisfies a broader requirement', () => {
  assert.equal(scopeSatisfies('edges:read:current', 'edges:read'), false)
})

test('verb and surface must match on segment boundaries', () => {
  assert.equal(scopeSatisfies('reading:read', 'reading:write'), false)
  assert.equal(scopeSatisfies('reading:read', 'readings:read'), false)
  assert.equal(scopeSatisfies('read', 'reading:read'), false)
  assert.equal(scopeSatisfies('reading', 'reading:read'), true)
})

test('empty inputs never satisfy; arrays are any-of', () => {
  assert.equal(scopeSatisfies('', 'reading:read'), false)
  assert.equal(scopeSatisfies('reading:read', ''), false)
  assert.equal(scopeSatisfies([], 'reading:read'), false)
  assert.equal(scopeSatisfies(['drift:read', 'reading:read'], 'reading:read:current'), true)
  assert.equal(scopeSatisfies(['drift:read', 'reading:write'], 'reading:read'), false)
})

test('root export is the same function', () => {
  assert.equal(fromRoot, scopeSatisfies)
})
