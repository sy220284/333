import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  getHistoricalToolNamesFor,
  normalizeHistoricalToolName,
  permissionToolNamesMatch,
} from '../src/utils/permissions/legacyToolAliases.mjs'

test('317 official historical tool identities resolve to active tools', () => {
  const mappings = {
    Task: 'Agent',
    KillShell: 'TaskStop',
    KillBash: 'TaskStop',
    ListPeers: 'ListAgents',
    Brief: 'SendUserMessage',
    ListMcpResources: 'ListMcpResourcesTool',
    ReadMcpResource: 'ReadMcpResourceTool',
    ReadMcpResourceDir: 'ReadMcpResourceDirTool',
  }
  for (const [oldName, currentName] of Object.entries(mappings)) {
    assert.equal(normalizeHistoricalToolName(oldName), currentName)
    assert.ok(permissionToolNamesMatch(oldName, currentName))
    assert.ok(getHistoricalToolNamesFor(currentName).includes(oldName))
  }
  assert.deepEqual(getHistoricalToolNamesFor('TaskStop'), ['KillShell', 'KillBash'])
})

test('317 legacy rules retain allow/deny/ask tool identity without renaming stored rules', () => {
  for (const oldName of ['Task', 'KillShell', 'KillBash']) {
    const newName = normalizeHistoricalToolName(oldName)
    for (const ruleBehavior of ['allow', 'deny', 'ask']) {
      const persistedRule = { ruleBehavior, toolName: oldName }
      assert.equal(persistedRule.toolName, oldName)
      assert.equal(permissionToolNamesMatch(persistedRule.toolName, newName), true)
    }
  }
})

test('317 retired TaskOutput identity never aliases into Read or active tools', () => {
  assert.equal(normalizeHistoricalToolName('TaskOutput'), 'TaskOutput')
  assert.equal(permissionToolNamesMatch('TaskOutput', 'Read'), false)
  assert.equal(permissionToolNamesMatch('TaskOutput', 'Agent'), false)
  assert.equal(permissionToolNamesMatch('TaskOutput', 'TaskStop'), false)
  assert.equal(permissionToolNamesMatch('Task', 'Read'), false)
  assert.equal(normalizeHistoricalToolName('mcp__example__Read'), 'mcp__example__Read')
  assert.equal(permissionToolNamesMatch('Task', 'mcp__example__Agent'), false)
})

test('317 permission engine checks both full-tool and scoped agent/content rule paths', () => {
  const file = resolve(import.meta.dirname, '../src/utils/permissions/permissions.ts')
  const source = readFileSync(file, 'utf8')
  assert.equal((source.match(/permissionToolNamesMatch\(rule\.ruleValue\.toolName,/g) ?? []).length, 4)
  assert.match(source, /getToolNameForPermissionCheck\(tool\)/)
  assert.match(source, /getDenyRuleForAgent/)
  assert.match(source, /filterDeniedAgents/)
  assert.match(source, /getRuleByContentsForToolName/)
})
