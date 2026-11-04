import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getForcedHyperlinkSetting } from '../src/ink/hyperlinkEnvPolicy.mjs'

test('317 FORCE_HYPERLINK false, no, off, 0 force OSC8 links off', () => {
  for (const value of ['false', 'FALSE', 'no', 'off', '0', ' off ']) {
    assert.equal(getForcedHyperlinkSetting({ FORCE_HYPERLINK: value }), false)
  }
})
test('317 FORCE_HYPERLINK positive values override terminal detection', () => {
  for (const value of ['true', 'YES', 'on', '1']) {
    assert.equal(getForcedHyperlinkSetting({ FORCE_HYPERLINK: value }), true)
  }
  assert.equal(getForcedHyperlinkSetting({}), null)
})
