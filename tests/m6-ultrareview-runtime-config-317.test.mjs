import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildUltrareviewEnvironment,
  getUltrareviewClientWaitMinutes,
} from '../src/utils/review/ultrareviewConfig.mjs'

test('317 official ultrareview defaults include result-relay budget and code-quality mode', () => {
  assert.equal(getUltrareviewClientWaitMinutes(null), 45)
  assert.deepEqual(buildUltrareviewEnvironment(null, ''), {
    BUGHUNTER_DRY_RUN: '1',
    AUTOPATCH_ENABLE_ASIMOV: '1',
    BUGHUNTER_CODE_QUALITY: '1',
    BUGHUNTER_FLEET_SIZE: '5',
    BUGHUNTER_MAX_DURATION: '10',
    BUGHUNTER_AGENT_TIMEOUT: '600',
    BUGHUNTER_TOTAL_WALLCLOCK: '22',
    BUGHUNTER_RESULT_RELAY_MAX_SEC: '2520',
  })
})

test('317 review config preserves selected model and bounded adjustments', () => {
  const config = {
    model: 'claude-opus-4-6',
    code_quality: false,
    fleet_size: 8.7,
    max_duration_minutes: 12.4,
    agent_timeout_seconds: 725,
    total_wallclock_minutes: 26,
    client_wait_minutes: 53.9,
  }
  assert.equal(getUltrareviewClientWaitMinutes(config), 53)
  const actual = buildUltrareviewEnvironment(config, 'test-dev-bundle')
  assert.equal(actual.BUGHUNTER_MODEL, 'claude-opus-4-6')
  assert.equal(actual.BUGHUNTER_FLEET_SIZE, '8')
  assert.equal(actual.BUGHUNTER_MAX_DURATION, '12')
  assert.equal(actual.BUGHUNTER_AGENT_TIMEOUT, '725')
  assert.equal(actual.BUGHUNTER_TOTAL_WALLCLOCK, '26')
  assert.equal(actual.BUGHUNTER_RESULT_RELAY_MAX_SEC, '3000')
  assert.equal(actual.BUGHUNTER_DEV_BUNDLE_B64, 'test-dev-bundle')
  assert.equal('BUGHUNTER_CODE_QUALITY' in actual, false)
})

test('317 invalid or over-cap configuration falls back consistently across all entrypoints', () => {
  for (const n of [undefined, null, NaN, Infinity, -1, 0, 29, 56, '45']) {
    assert.equal(getUltrareviewClientWaitMinutes({ client_wait_minutes: n }), 45)
  }
  const actual = buildUltrareviewEnvironment({
    fleet_size: 21,
    max_duration_minutes: 26,
    agent_timeout_seconds: -2,
    total_wallclock_minutes: 28,
    client_wait_minutes: 30,
    model: '',
  }, '')
  assert.equal(actual.BUGHUNTER_FLEET_SIZE, '5')
  assert.equal(actual.BUGHUNTER_MAX_DURATION, '10')
  assert.equal(actual.BUGHUNTER_AGENT_TIMEOUT, '600')
  assert.equal(actual.BUGHUNTER_TOTAL_WALLCLOCK, '22')
  assert.equal(actual.BUGHUNTER_RESULT_RELAY_MAX_SEC, '1620')
  assert.equal('BUGHUNTER_MODEL' in actual, false)
})
