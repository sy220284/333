import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const native = process.env.CLAUDE_TARGET_X64
const compiled = resolve(import.meta.dirname, '../dist/cli.js')

test('2.1.317 plugin tag: original and reconstructed executable create identical annotated git tags', {
  skip: native ? false : 'Requires official Linux x64 program',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'pr7-tag-native-'))
  try {
    const outputs = {}
    for (const kind of ['original', 'rebuilt']) {
      const work = join(root, kind)
      const config = join(root, kind + '-config')
      mkdirSync(join(work, '.claude-plugin'), { recursive: true })
      writeFileSync(join(work, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'example-tool', version: '1.2.3',
          description: 'Example', author: { name: 'Tester' } }))
      const git = (...args) => execFileSync('git', ['-C', work, ...args], { encoding: 'utf8' }).trim()
      git('init', '-q')
      git('config', 'user.name', 'Tester')
      git('config', 'user.email', 'tester@example.com')
      git('add', '.')
      git('commit', '-qm', 'initial')
      const run = args => {
        const proc = spawnSync(kind === 'original' ? native : 'bun',
          kind === 'original' ? ['plugin', 'tag', ...args] : [compiled, 'plugin', 'tag', ...args],
          { cwd: work, encoding: 'utf8', timeout: 15000,
            env: { ...process.env, CLAUDE_CONFIG_DIR: config,
              CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1' } })
        assert.equal(proc.error, undefined, String(proc.error))
        return { status: proc.status,
          out: proc.stdout.replaceAll(work, '<repo>').replace(/\r\n/g, '\n').trimEnd(),
          err: proc.stderr.replaceAll(work, '<repo>').replace(/\r\n/g, '\n').trimEnd() }
      }
      const dry = run(['--dry-run'])
      const create = run([])
      const tag = git('tag', '-l', 'example-tool--v1.2.3')
      const duplicate = run(['--dry-run'])
      const forced = run(['--force', '--dry-run'])
      assert.equal(dry.status, 0, kind + ': ' + dry.out + dry.err)
      assert.equal(create.status, 0, kind + ': ' + create.out + create.err)
      assert.equal(duplicate.status, 1, kind + ': ' + duplicate.out + duplicate.err)
      assert.equal(forced.status, 0, kind + ': ' + forced.out + forced.err)
      assert.equal(tag, 'example-tool--v1.2.3')
      outputs[kind] = { dry, create, tag, duplicate, forced }
    }
    assert.deepEqual(outputs.rebuilt, outputs.original)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
