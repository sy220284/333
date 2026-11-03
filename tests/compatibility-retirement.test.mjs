import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { stripTypeScriptTypes } from 'node:module'
const root = new URL('../src/', import.meta.url)
function sources(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder.pathname ?? folder, entry.name)
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}
test('all internal settings consumers use the canonical reader', () => {
  for (const path of sources(root)) {
    assert.doesNotMatch(readFileSync(path, 'utf8').split('//# sourceMappingURL=')[0], /\bgetSettings_DEPRECATED\b/, path)
  }
})
test('retired output permissions retain identity without granting file access', () => {
  const text = stripTypeScriptTypes(readFileSync(new URL('utils/permissions/permissionRuleParser.ts', root), 'utf8'))
  const start = text.indexOf('const LEGACY_TOOL_NAME_ALIASES')
  const end = text.indexOf('\n}', text.indexOf('export function normalizeLegacyToolName')) + 2
  const normalize = new Function('AGENT_TOOL_NAME', 'TASK_STOP_TOOL_NAME', 'feature', 'BRIEF_TOOL_NAME', `${text.slice(start, end).replace('export ', '')};return normalizeLegacyToolName`)('Agent', 'TaskStop', () => false, null)
  assert.equal(normalize('Task'), 'Agent')
  assert.equal(normalize('KillShell'), 'TaskStop')
  for (const name of ['TaskOutput', 'AgentOutputTool', 'BashOutputTool']) assert.equal(normalize(name), 'TaskOutput')
  assert.equal(normalize('Read'), 'Read')
  const api = readFileSync(new URL('utils/api.ts', root), 'utf8').split('//# sourceMappingURL=')[0]
  assert.doesNotMatch(api, /TASK_OUTPUT_TOOL_NAME|case ['"]TaskOutput['"]/)
})
