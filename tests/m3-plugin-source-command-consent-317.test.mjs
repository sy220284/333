import test from 'node:test'
import assert from 'node:assert/strict'
import {
  commandSourceDigest, commandSourceDisclosure, isAuthorizedSourceCommand,
  localCatalogRevision,
} from '../src/utils/plugins/commandSourceConsent.mjs'

test('official 2.1.317 x64 command disclosure SHA256 includes full command and marketplace revision', () => {
  const original = {
    kind: 'command_source',
    pluginId: 'command-demo@command-audit',
    command: "printf '/mnt/data/pr7_audit/command-market/target\\n'",
    mode: 'copy',
    catalogRevision: 'sha256:26b18d6411b68c39149929350d803e8b893dd6706c47dbd10a1e9ae74fef53e7',
  }
  const nativeDigest = '51240c2ab3f9a39a1a9f560c9b0258bc65bc481303c026ce6a64b5865597fc1a'
  assert.equal(commandSourceDigest(original), nativeDigest)
  const shown = commandSourceDisclosure(original, nativeDigest.toUpperCase())
  assert.equal(shown.sha256, nativeDigest)
  assert.equal(shown.acceptCommandMatched, true)
  assert.equal(isAuthorizedSourceCommand(shown, { acceptCommand: nativeDigest }), true)
  assert.equal(isAuthorizedSourceCommand(shown, { acceptCommand: nativeDigest, isNestedSession: true }), false)
  assert.equal(isAuthorizedSourceCommand(shown, { acceptCommand: 'wrong' }), false)
  assert.equal(isAuthorizedSourceCommand(shown, { yes: true }), true)
  for (const modified of [
    { command: original.command + ' && echo change' },
    { mode: 'link' },
    { pluginId: 'other@command-audit' },
    { catalogRevision: original.catalogRevision + '-refreshed' },
  ]) {
    assert.notEqual(commandSourceDigest({ ...original, ...modified }), nativeDigest)
  }
})

test('canonical marketplace digest is independent of JSON key ordering', () => {
  const one = { name: 'market', plugins: [{ name: 'one', source: './one' }], owner: { name: 'tester' } }
  const another = { owner: { name: 'tester' }, plugins: [{ source: './one', name: 'one' }], name: 'market' }
  assert.equal(localCatalogRevision(one), localCatalogRevision(another))
  assert.notEqual(localCatalogRevision(one), localCatalogRevision({ ...one, plugins: [] }))
})
