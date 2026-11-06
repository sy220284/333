import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
test('purge CLI previews, validates, deletes its planned state and retains credentials', () => {
  const root = mkdtempSync(join(tmpdir(), '333-purge-cli-'))
  const home = join(root, 'config'), project = join(root, 'work')
  const id = '11111111-1111-4111-8111-111111111111'
  const dir = join(home, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(project); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.jsonl`), JSON.stringify({ cwd: project }) + '\n')
  writeFileSync(join(home, 'history.jsonl'), JSON.stringify({ project }) + '\n')
  writeFileSync(join(home, '.yaoyaoche.json'), JSON.stringify({ projects: { [project]: { hasTrustDialogAccepted: true } } }))
  writeFileSync(join(home, '.credentials.json'), '{"untouched":"yes"}')
  const run = args => {
    const result = spawnSync('bun', [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 25_000, env: { ...process.env, YAOYAOCHE_CONFIG_DIR: home, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1' } })
    assert.ifError(result.error)
    return result
  }
  try {
    let result = run(['purge', project, '--dry-run'])
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Dry run: 3 item/)
    assert.equal(existsSync(dir), true)
    result = run(['project', 'purge', project, '--dry-run'])
    assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(dir), true)
    result = run(['purge', project, '--all', '--yes'])
    assert.equal(result.status, 1); assert.match(result.stderr, /both a path and --all/); assert.equal(existsSync(dir), true)
    result = run(['purge', '--all', '-i'])
    assert.equal(result.status, 1); assert.match(result.stderr, /interactive with --all/)
    result = run(['purge', project])
    assert.equal(result.status, 1); assert.match(result.stderr, /interactive terminal/); assert.equal(existsSync(dir), true)
    result = run(['purge', project, '--yes'])
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Purged 3 item/)
    assert.equal(existsSync(dir), false); assert.equal(existsSync(project), true)
    assert.equal(readFileSync(join(home, 'history.jsonl'), 'utf8'), '')
    assert.equal(JSON.parse(readFileSync(join(home, '.yaoyaoche.json'), 'utf8')).projects[project], undefined)
    assert.equal(readFileSync(join(home, '.credentials.json'), 'utf8'), '{"untouched":"yes"}')
    result = run(['purge', project, '--yes']); assert.equal(result.status, 1); assert.match(result.stderr, /No 摇摇车 project state/)
    result = run(['purge', '--all', '--yes']); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /across all projects/)
    assert.equal(existsSync(join(home, 'history.jsonl')), false)
    assert.equal(readFileSync(join(home, '.credentials.json'), 'utf8'), '{"untouched":"yes"}')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
