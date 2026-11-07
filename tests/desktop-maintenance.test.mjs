import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const repository = fileURLToPath(new URL('../', import.meta.url))
const childScript = `
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
const repo = process.env.YAOYAO_TEST_SOURCE
const project = process.cwd()
const config = await import(pathToFileURL(join(repo, 'src/utils/config.ts')).href)
config.enableConfigs()
const { createDesktopGateway } = await import(pathToFileURL(join(repo, 'src/services/desktop/gateway.ts')).href)
const gateway = createDesktopGateway({ cwd: project })
try {
  const preview = await gateway.handle({ id: 'preview', method: 'data.purge.preview' })
  if (preview.workspace !== project || preview.items.length < 3) throw new Error('Preview missing target records')
  const expected = preview.items.some(item => item.kind === 'config-key') &&
    preview.items.some(item => item.kind === 'history-lines') &&
    preview.items.some(item => item.kind === 'dir')
  if (!expected) throw new Error('Preview did not identify all protected sources')
  let denied = false
  try {
    await gateway.handle({ id: 'invalid', method: 'data.purge.apply', token: '00000000-0000-4000-8000-000000000000' })
  } catch (error) {
    denied = String(error).includes('清理预览')
  }
  if (!denied) throw new Error('An invalid purge token was accepted')
  const result = await gateway.handle({ id: 'apply', method: 'data.purge.apply', token: preview.token })
  if (result.total !== preview.items.length || result.errors.length !== 0 || result.deleted !== result.total)
    throw new Error('Purge did not complete every planned item: ' + JSON.stringify(result))
  let replayDenied = false
  try {
    await gateway.handle({ id: 'replay', method: 'data.purge.apply', token: preview.token })
  } catch (error) {
    replayDenied = String(error).includes('清理预览')
  }
  if (!replayDenied) throw new Error('Purge token was reusable')
  process.stdout.write(JSON.stringify({ preview: preview.items.length, deleted: result.deleted, denied, replayDenied }))
} finally {
  await gateway.close()
}
`

test('桌面数据管理真实预览、令牌保护与文件清理，保留项目源码和凭证', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'yaoyao-maintenance-')))
  const home = join(root, 'config')
  const project = join(root, 'workspace')
  const other = join(root, 'unrelated')
  const session = '11111111-1111-4111-8111-111111111111'
  const directory = join(home, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
  try {
    await mkdir(project, { recursive: true })
    await mkdir(other, { recursive: true })
    await mkdir(directory, { recursive: true })
    await writeFile(join(project, 'source.ts'), 'export const preserved = true\n')
    await writeFile(join(directory, `${session}.jsonl`), `${JSON.stringify({ cwd: project })}\n`)
    await writeFile(join(home, 'history.jsonl'), `${JSON.stringify({ project, display: 'remove' })}\n${JSON.stringify({ project: other, display: 'keep' })}\n`)
    await writeFile(join(home, '.yaoyaoche.json'), JSON.stringify({ projects: { [project]: { hasTrustDialogAccepted: true } } }))
    await writeFile(join(home, '.credentials.json'), '{"key":"preserve"}')
    const result = spawnSync('bun', ['-e', childScript], {
      cwd: project,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, YAOYAO_TEST_SOURCE: repository, YAOYAOCHE_CONFIG_DIR: home,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1' },
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    const verified = JSON.parse(result.stdout)
    assert.equal(verified.deleted, verified.preview)
    assert.equal(verified.denied, true)
    assert.equal(verified.replayDenied, true)
    assert.equal((await stat(join(project, 'source.ts'))).isFile(), true)
    assert.equal(await readFile(join(home, '.credentials.json'), 'utf8'), '{"key":"preserve"}')
    assert.equal(JSON.parse(await readFile(join(home, '.yaoyaoche.json'), 'utf8')).projects[project], undefined)
    const history = await readFile(join(home, 'history.jsonl'), 'utf8')
    assert.ok(history.includes('keep'))
    assert.ok(!history.includes('remove'))
    assert.equal((await stat(other)).isDirectory(), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
