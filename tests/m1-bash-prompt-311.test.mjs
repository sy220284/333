import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
test('2.1.311 Bash prompt describes process-isolated shell calls without claiming persistent state', () => {
  const prompt = readFileSync(new URL('../src/tools/BashTool/prompt.ts', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/utils/Shell.ts', import.meta.url), 'utf8')
  assert.match(prompt,/Each command starts a fresh shell/)
  assert.doesNotMatch(prompt,/The working directory persists between commands/)
  assert.match(shell,/Creates a new shell process for each command execution/)
})
