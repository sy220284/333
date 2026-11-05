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
test('new wildcard matching enforces command boundaries', () => {
  const start = shell.indexOf('export function matchWildcardPattern(')
  const end = shell.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start)
  const sharedConstants = shell.slice(
    shell.indexOf('const ESCAPED_STAR_PLACEHOLDER'),
    shell.indexOf('/**\n * Parsed permission rule')
  )
  const wildcard = new Function(
    `${sharedConstants}\n${shell.slice(start, end).replace('export ', '')}\nreturn matchWildcardPattern`
  )()
  assert.equal(wildcard('npm *', 'npm install'), true)
  assert.equal(wildcard('npm *', 'npm'), true)
  assert.equal(wildcard('npm *', 'npm-evil install'), false)
  assert.equal(wildcard('npm *', 'rm -rf /'), false)
})

test('retired colon-prefix permissions fail explicitly', () => {
  assert.throws(() => parsePermissionRule('npm:*'), error => error.message.includes('Old :* prefix permissions'))
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
