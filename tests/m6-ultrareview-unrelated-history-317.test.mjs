import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

function git(cwd, args, input) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', timeout: 15000 })
  assert.equal(result.error, undefined, args.join(' ') + ': ' + result.error)
  return result
}

test('2.1.317 no-merge-base review: one snapshot commit contains the full tree without ancestry', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pr7-review-unrelated-'))
  try {
    assert.equal(git(cwd, ['init', '-b', 'main']).status, 0)
    assert.equal(git(cwd, ['config', 'user.name', 'Review Test']).status, 0)
    assert.equal(git(cwd, ['config', 'user.email', 'review-test@example.invalid']).status, 0)
    writeFileSync(join(cwd, 'base.txt'), 'base\n')
    assert.equal(git(cwd, ['add', '.']).status, 0)
    assert.equal(git(cwd, ['commit', '-m', 'initial']).status, 0)
    assert.equal(git(cwd, ['checkout', '--orphan', 'feature']).status, 0)
    assert.equal(git(cwd, ['rm', '-rf', '--cached', '.']).status, 0)
    writeFileSync(join(cwd, 'feature.txt'), 'feature\n')
    assert.equal(git(cwd, ['add', '.']).status, 0)
    assert.equal(git(cwd, ['commit', '-m', 'unrelated']).status, 0)
    assert.notEqual(git(cwd, ['merge-base', 'main', 'HEAD']).status, 0)

    const base = git(cwd, ['hash-object', '-t', 'tree', '--stdin'], '')
    assert.equal(base.status, 0)
    const emptySha = base.stdout.trim()
    assert.match(emptySha, /^[0-9a-f]{40,64}$/)
    const diff = git(cwd, ['diff', '--shortstat', emptySha])
    assert.equal(diff.status, 0)
    assert.match(diff.stdout, /\d+ files? changed/)

    const snapshot = git(cwd, ['commit-tree', 'HEAD^{tree}', '-m', 'seed'])
    assert.equal(snapshot.status, 0, snapshot.stderr)
    const root = snapshot.stdout.trim()
    assert.equal(git(cwd, ['update-ref', 'refs/seed/root', root]).status, 0)
    const out = join(cwd, 'seed.bundle')
    assert.equal(git(cwd, ['bundle', 'create', out, 'refs/seed/root']).status, 0)
    const heads = git(cwd, ['bundle', 'list-heads', out])
    assert.ok(heads.stdout.includes(root + ' refs/seed/root'))
    assert.equal(git(cwd, ['rev-list', '--count', root]).stdout.trim(), '1')
    assert.equal(git(cwd, ['rev-parse', 'HEAD^{tree}']).stdout,
      git(cwd, ['rev-parse', root + '^{tree}']).stdout)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})


test('317 snapshot mode stays connected to CLI, transport and bundle creator', () => {
  const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
  const cli = read('src/cli/handlers/ultrareview.ts')
  const interactive = read('src/commands/review/reviewRemote.ts')
  const interactiveEntry = read('src/commands/review/ultrareviewCommand.tsx')
  const consentDialog = read('src/commands/review/UltrareviewAllFilesDialog.tsx')
  const remote = read('src/utils/teleport.tsx')
  const bundle = read('src/utils/teleport/gitBundle.ts')
  assert.match(cli, /bundleForceScope: 'squashed'/)
  assert.match(cli, /resolveUltrareviewGitBase/)
  assert.match(interactive, /resolveUltrareviewGitBase/)
  assert.match(interactive, /options.allowAllFiles !== true/)
  assert.match(interactive, /bundleForceScope: 'squashed'/)
  assert.match(interactiveEntry, /UltrareviewAllFilesDialog/)
  assert.match(interactiveEntry, /allowAllFiles = false/)
  assert.match(consentDialog, /确认上传全部已跟踪文件并开始审查/)
  assert.match(cli, /Review and upload all tracked files/)
  assert.match(remote, /forceScope: options\.bundleForceScope/)
  assert.match(bundle, /forceScope !== 'squashed'/)
  assert.match(bundle, /\['commit-tree', treeRef, '-m', 'seed'\]/)
})

test('317 shared Git base: common, no-commit and unrelated paths are classified consistently', async () => {
  const { resolveUltrareviewGitBase } = await import('../src/utils/review/ultrareviewGitBase.mjs')
  const calls = []
  const common = await resolveUltrareviewGitBase('main', async args => {
    calls.push(args.join(' '))
    return { code: 0, stdout: 'abc123' }
  })
  assert.deepEqual(common, { kind: 'common', base: 'abc123', forceAllFiles: false })
  assert.deepEqual(calls, ['merge-base main HEAD'])
  const noCommits = await resolveUltrareviewGitBase('main', async () => ({ code: 1, stdout: '' }))
  assert.deepEqual(noCommits, { kind: 'no-commits' })
  const unrelated = await resolveUltrareviewGitBase('main', async args => {
    if (args[0] === 'merge-base') return { code: 1, stdout: '' }
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'head-sha' }
    return { code: 0, stdout: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' }
  })
  assert.deepEqual(unrelated, {
    kind: 'all-files', base: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', forceAllFiles: true,
  })
})
