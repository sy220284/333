import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'

const root = new URL('../src/', import.meta.url)
const shell = stripTypeScriptTypes(readFileSync(new URL('utils/permissions/shellRuleMatching.ts', root), 'utf8'))
function extract(name, dependencies = {}) {
  const begin = shell.indexOf(`export function ${name}(`)
  assert.ok(begin >= 0, name)
  const end = shell.indexOf('\n}', begin) + 2
  assert.ok(end > begin, name)
  return new Function(...Object.keys(dependencies),
    `${shell.slice(begin, end).replace('export ', '')}\nreturn ${name}`)(...Object.values(dependencies))
}
const hasWildcards = extract('hasWildcards')
const parsePermissionRule = extract('parsePermissionRule', { hasWildcards })
const suggestionForPrefix = extract('suggestionForPrefix')

test('current wildcard permissions parse and suggest correctly', () => {
  assert.deepEqual(parsePermissionRule('npm *'), { type: 'wildcard', pattern: 'npm *' })
  assert.deepEqual(parsePermissionRule('npm'), { type: 'exact', command: 'npm' })
  assert.equal(suggestionForPrefix('Bash', 'npm')[0].rules[0].ruleContent, 'npm *')
  assert.equal(hasWildcards('npm *'), true)
  assert.equal(hasWildcards('npm \\*'), false)
})
test('retired colon-prefix permissions fail explicitly', () => {
  assert.throws(() => parsePermissionRule('npm:*'), /Old :\\* prefix permissions/)
  const validation = readFileSync(new URL('utils/settings/permissionValidation.ts', root), 'utf8')
  assert.ok(validation.includes("content.includes(':*')"))
  for (const path of [
    'tools/BashTool/bashPermissions.ts', 'tools/PowerShellTool/powershellPermissions.ts',
    'tools/BashTool/shouldUseSandbox.ts',
  ]) {
    const code = readFileSync(new URL(path, root), 'utf8').split('//# sourceMappingURL=')[0]
    assert.equal(code.includes("case 'prefix':"), false, path)
  }
})
