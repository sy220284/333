import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { isValidCustomCommandName } from '../src/utils/commandNameValidation.mjs'

test('valid built-in, namespaced, unicode and MCP command names remain available', () => {
  for (const name of ['help', 'plugin:install', 'my-team:test-v2', '中文命令', 'mcp:server (MCP)']) {
    assert.equal(isValidCustomCommandName(name), true, name)
  }
})
test('malformed file-derived names cannot break the command list', () => {
  for (const name of ['', ' ', 'bad command', 'new\nline', 'bad\u0000name', ' bad', 'bad ']) {
    assert.equal(isValidCustomCommandName(name), false, String(name))
  }
  assert.equal(isValidCustomCommandName(null), false)
  assert.equal(isValidCustomCommandName(17), false)
  assert.equal(isValidCustomCommandName('a'.repeat(257)), false)
})
test('command registry drops invalid external names before calling enablement and retains built-in failures', () => {
  const source = readFileSync(new URL('../src/commands.ts', import.meta.url), 'utf8')
  const commands = source.slice(source.indexOf('export async function getCommands('))
  const guard = commands.indexOf('isValidCustomCommandName(cmd.name)')
  const enablement = commands.indexOf('meetsAvailabilityRequirement(cmd)')
  assert.ok(guard >= 0 && enablement > guard)
  assert.match(commands, /if \(cmd.source === 'builtin'\)/)
  assert.match(commands, /isValidCustomCommandName\(s.name\)/)
})
