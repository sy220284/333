import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesDefaultModelVariant } from '../src/services/api/modelCacheMatch.mjs'

// These fixtures represent the output of the existing getCanonicalName resolver.
const canonical = model => {
  const match = model.match(/claude-(?:opus|sonnet)-4-(?:5|6)(?![0-9])/)
  return match?.[0] ?? model
}

test('2.1.317: default Opus with [1m], region and dated spellings matches', () => {
  const def = 'claude-opus-4-6'
  assert.equal(matchesDefaultModelVariant('claude-opus-4-6[1m]', def, canonical), true)
  assert.equal(matchesDefaultModelVariant('eu.anthropic.claude-opus-4-6-v1', def, canonical), true)
  assert.equal(matchesDefaultModelVariant('claude-opus-4-6-20261015', def, canonical), true)
  assert.equal(matchesDefaultModelVariant('claude-opus-4-6', def, canonical), true)
})

test('2.1.317: default Sonnet matches [1m], dated and cross-region aliases', () => {
  const def = 'claude-sonnet-4-6'
  assert.equal(matchesDefaultModelVariant('claude-sonnet-4-6[1m]', def, canonical), true)
  assert.equal(matchesDefaultModelVariant('us.anthropic.claude-sonnet-4-6-v1:0', def, canonical), true)
  assert.equal(matchesDefaultModelVariant('claude-sonnet-4-6-20261015', def, canonical), true)
})

test('different model generations and families remain eligible for caching', () => {
  assert.equal(matchesDefaultModelVariant('claude-opus-4-5', 'claude-opus-4-6', canonical), false)
  assert.equal(matchesDefaultModelVariant('claude-sonnet-4-5', 'claude-sonnet-4-6', canonical), false)
  assert.equal(matchesDefaultModelVariant('claude-sonnet-4-6', 'claude-opus-4-6', canonical), false)
  assert.equal(matchesDefaultModelVariant('claude-opus-4-60', 'claude-opus-4-6', canonical), false)
})

test('custom deployments retain exact-match behavior', () => {
  assert.equal(matchesDefaultModelVariant('custom-opus', 'custom-opus', canonical), true)
  assert.equal(matchesDefaultModelVariant('custom-opus-eu', 'custom-opus', canonical), false)
})
