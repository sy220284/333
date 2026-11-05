import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolvePackagedRipgrep } from '../src/utils/ripgrepVendor317.mjs'

function withRelease(run) {
  const root = mkdtempSync(join(tmpdir(), 'm1-317-rg-vendor-'))
  try {
    const binary = join(root, 'release', 'claude')
    const rg = join(root, 'release', 'vendor', 'ripgrep', 'x64-linux', 'rg')
    mkdirSync(dirname(rg), { recursive: true })
    writeFileSync(binary, 'compiled executable fixture')
    writeFileSync(rg, 'vendored ripgrep fixture')
    run({ root, binary, rg })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('compiled Bun virtual module is never a native spawn target', () => withRelease(({ binary, rg }) => {
  const x = resolvePackagedRipgrep({
    execPath: '/$bunfs/root/claude',
    argv0: binary,
    scriptPath: '/$bunfs/root/cli.js',
    modulePath: '/$bunfs/root/src/utils/ripgrep.js',
    arch: 'x64', platform: 'linux',
  })
  assert.equal(x.path, realpathSync(rg))
  assert.ok(x.candidates.every(path => !path.includes('$bunfs')))
}))

test('release executable symlink resolves platform rg from real distribution', { skip: process.platform === 'win32' }, () => withRelease(({ root, binary, rg }) => {
  const symlink = join(root, 'claude-symlink')
  symlinkSync(binary, symlink, 'file')
  const x = resolvePackagedRipgrep({
    execPath: symlink, argv0: undefined, arch: 'x64', platform: 'linux',
  })
  assert.equal(x.path, realpathSync(rg))
}))

test('source Bun script uses its own distribution directory', () => withRelease(({ binary, rg }) => {
  const x = resolvePackagedRipgrep({
    execPath: process.execPath, argv0: process.execPath,
    scriptPath: binary, arch: 'x64', platform: 'linux',
  })
  assert.equal(x.path, realpathSync(rg))
}))

test('missing platform resource is a failure, not a virtual fallback or PATH search', () => withRelease(({ binary }) => {
  const x = resolvePackagedRipgrep({
    execPath: binary, argv0: 'rg', modulePath: '/$bunfs/root/cli.js',
    arch: 'arm64', platform: 'darwin',
  })
  assert.equal(x.path, null)
  assert.ok(x.candidates.every(p => p.endsWith(join('vendor', 'ripgrep', 'arm64-darwin', 'rg'))))
}))
