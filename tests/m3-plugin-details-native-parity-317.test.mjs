import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const oracle = process.env.CLAUDE_TARGET_X64
const rebuilt = resolve(import.meta.dirname, '../dist/cli.js')
test('317 plugin details: native and rebuilt commands match installed inventory, errors and empty token cost', {
  skip: !oracle && 'Requires official Linux x64 2.1.317',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'pr7-details-native-'))
  try {
    const outputs = {}
    for (const kind of ['official', 'rebuilt']) {
      const configDir = join(root, kind)
      const invoke = args => {
        const result = spawnSync(kind === 'official' ? oracle : 'bun',
          kind === 'official' ? args : [rebuilt, ...args], {
            cwd: root, encoding: 'utf8', timeout: 15000,
            env: { ...process.env, CLAUDE_CONFIG_DIR: configDir,
              CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
              DISABLE_TELEMETRY: '1' },
          })
        assert.equal(result.error, undefined, String(result.error))
        return { status: result.status,
          out: result.stdout.replace(/\r\n/g, '\n'),
          err: result.stderr.replace(/\r\n/g, '\n') }
      }
      const init = invoke(['plugin', 'init', 'empty-example', '--author', 'Verification'])
      assert.equal(init.status, 0, init.err + init.out)
      const basic = invoke(['plugin', 'details', 'empty-example'])
      assert.equal(basic.status, 0, basic.err + basic.out)
      assert.match(basic.out, /Skills \(0\)/)
      assert.match(basic.out, /Always-on:\s+~0 tok/)
      const fullInit = invoke(['plugin', 'init', 'component-example', '--author', 'Verification',
        '--with', 'skills', 'agents', 'hooks', 'mcp', 'lsp'])
      assert.equal(fullInit.status, 0, fullInit.err + fullInit.out)
      const listJson = invoke(['plugin', 'list', '--json'])
      const listHuman = invoke(['plugin', 'list'])
      assert.equal(listJson.status, 0, listJson.err + listJson.out)
      assert.equal(listHuman.status, 0, listHuman.err + listHuman.out)
      const full = invoke(['plugin', 'details', 'component-example'])
      assert.equal(full.status, 0, full.err + full.out)
      assert.match(full.out, /Skills \(1\)\s+example/)
      assert.match(full.out, /Agents \(1\)\s+example/)
      assert.match(full.out, /MCP servers \(2\)/)
      const missing = invoke(['plugin', 'details', 'not-installed-example'])
      assert.equal(missing.status, 1, missing.err + missing.out)
      assert.match(missing.out, /not found.*claude plugin list/)
      // The official listing surfaces a corrupt user-skill plugin, including
      // the error type and manifest path, instead of reporting an empty list.
      const malformed = join(configDir, 'skills', 'malformed-example', '.claude-plugin')
      mkdirSync(malformed, { recursive: true })
      writeFileSync(join(malformed, 'plugin.json'), '{ invalid json\\n')
      const malformedJson = invoke(['plugin', 'list', '--json'])
      const malformedHuman = invoke(['plugin', 'list'])
      assert.equal(malformedJson.status, 0, malformedJson.err + malformedJson.out)
      assert.equal(malformedHuman.status, 0, malformedHuman.err + malformedHuman.out)
      assert.match(malformedJson.out, /manifest-parse-error/)
      outputs[kind] = {
        invalidJson: malformedJson.out.replaceAll(configDir, '<config>'),
        invalidHuman: malformedHuman.out.replaceAll(configDir, '<config>'),
        basic, missing, fullOutput: full.out,
        list: listJson.out.replaceAll(configDir, '<config>'),
        humanList: listHuman.out.replaceAll(configDir, '<config>'),
      }
    }
    assert.deepEqual(outputs.rebuilt, outputs.official,
      '2.1.317 plugin details inventory or CLI result does not match installed x64')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
