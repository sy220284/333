import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const native = process.env.CLAUDE_TARGET_X64
const rebuilt = resolve(import.meta.dirname, '../dist/cli.js')

test('2.1.317 plugin init generates exactly the official files, modes, warnings and validation behavior', {
  skip: native ? false : 'Requires official Claude Code Linux x64 executable',
}, () => {
  const root = mkdtempSync(join(tmpdir(), '333-plugin-init-native-'))
  const run = (kind, argv) => {
    const home = join(root, kind)
    const executable = kind === 'original' ? native : 'bun'
    const args = kind === 'original' ? argv : [rebuilt, ...argv]
    const env = {
      ...process.env, CLAUDE_CONFIG_DIR: home,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
    }
    const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8',
      timeout: 30000, env, maxBuffer: 1024 * 1024 })
    assert.ifError(result.error)
    return result
  }
  function collect(dir) {
    const contents = {}
    function scan(path) {
      for (const e of readdirSync(path, { withFileTypes: true })) {
        const p = join(path, e.name)
        if (e.isDirectory()) scan(p)
        else if (e.isFile()) contents[relative(dir, p).replaceAll('\\', '/')] = readFileSync(p, 'utf8')
      }
    }
    scan(dir)
    return contents
  }
  try {
    const products = {}
    for (const kind of ['original', 'candidate']) {
      const baseline = run(kind, ['plugin', 'init', 'basic-demo', '--author', 'Verify', '--author-email', 'verify@example.com', '--description', 'Example'])
      assert.equal(baseline.status, 0, kind + ': ' + baseline.stdout + baseline.stderr)
      assert.match(baseline.stdout, /Created plugin "basic-demo"/)
      const duplicate = run(kind, ['plugin', 'init', 'basic-demo'])
      assert.equal(duplicate.status, 1, kind + ': duplicate should reject')
      assert.match(duplicate.stdout, /already exists.*--force/)
      const forced = run(kind, ['plugin', 'init', 'basic-demo', '--force', '--author', 'Verify'])
      assert.equal(forced.status, 0, kind + ': force should overwrite')
      const all = run(kind, ['plugin', 'new', 'full-demo', '--author', 'Verify',
        '--author-email', 'verify@example.com', '--description', 'Full example',
        '--with', 'skills', 'agents', 'hooks', 'mcp', 'lsp', 'output-style', 'channel'])
      assert.equal(all.status, 0, kind + ': ' + all.stdout + all.stderr)
      const invalid = run(kind, ['plugin', 'init', 'bad/name'])
      assert.equal(invalid.status, 1, kind + ': traversal should reject')
      assert.match(invalid.stdout, /Invalid plugin name/)
      const unknown = run(kind, ['plugin', 'init', 'unrecognized', '--with', 'unknown'])
      assert.equal(unknown.status, 1, kind + ': invalid component should reject')
      assert.match(unknown.stdout, /Unknown --with component/)
      const basicDir = join(root, kind, 'skills', 'basic-demo')
      const fullDir = join(root, kind, 'skills', 'full-demo')
      assert.ok(statSync(basicDir).isDirectory())
      assert.ok(statSync(fullDir).isDirectory())
      products[kind] = { basic: collect(basicDir), full: collect(fullDir) }
    }
    assert.deepEqual(products.candidate, products.original,
      'Generated skills, agents, hooks, MCP, LSP, output-style, channel and metadata differ from official x64')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
