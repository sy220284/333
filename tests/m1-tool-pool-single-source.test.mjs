import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const src = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8')

test('M3 tool-pool assembly has one permission-filtered, deduplicated source of truth', async () => {
  const pool = await src('src/tools.ts')
  assert.match(pool, /export function assembleToolPool\(/)
  assert.match(pool, /filterToolsByDenyRules\(mcpTools, permissionContext\)/)
  assert.match(pool, /return uniqBy\(/)
  assert.doesNotMatch(pool, /export function getMergedTools\(/)
  assert.doesNotMatch(pool, /return \[\.\.\.builtInTools, \.\.\.mcpTools\]/)
})

test('UI, model, and subagent consumers use the unified tool-pool assembly', async () => {
  for (const path of [
    'src/hooks/useMergedTools.ts',
    'src/cli/print.ts',
    'src/tools/AgentTool/resumeAgent.ts',
  ]) {
    const code = await src(path)
    assert.match(code, /assembleToolPool/, `${path} bypassed shared tool-pool assembly`)
    assert.doesNotMatch(code, /getMergedTools/, `${path} depends on legacy tool list`)
  }
})
