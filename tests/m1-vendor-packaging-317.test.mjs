import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const packageScript = join(root, 'build/package-release.mjs')
const sha256 = data => createHash('sha256').update(data).digest('hex')

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), '333-vendor-release-317-'))
  try {
    for (const file of ['build/package-release.mjs', 'build/release-launcher.cjs', 'build/public-dependencies.lock.json',
      'LICENSE.md', 'package.json', 'dist/cli.js',
      'vendor/audio-capture/x64-linux/audio-capture.node', 'vendor/ripgrep/COPYING']) {
      const dest = join(dir, file)
      mkdirSync(dirname(dest), { recursive: true })
      if (file === 'build/package-release.mjs') copyFileSync(packageScript, dest)
      else if (file === 'build/release-launcher.cjs') copyFileSync(join(root, file), dest)
      else writeFileSync(dest, file === 'package.json' ? '{"version":"2.1.317"}\n' : file)
    }
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function build(dir, preload) {
  return spawnSync(process.execPath, [
    ...(preload ? ['--require', preload] : []),
    join(dir, 'build/package-release.mjs'),
  ], {
    cwd: dir, encoding: 'utf8', timeout: 15_000,
  })
}
function assertNoPackagingTemps(dir) {
  assert.deepEqual(
    readdirSync(dir).filter(name => name.startsWith('.vendor-stage-') ||
      name.startsWith('.vendor-backup-')),
    [],
    'A successful or recovered package operation must not leak temporary directories',
  )
}
function walk(dir, base=dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full, base)
    assert.equal(entry.isFile(), true, 'No links, special files or unknown entries')
    return [relative(base, full).replaceAll('\\', '/')]
  }).sort()
}

test('M1 C19-T03: repeated packaging removes obsolete vendor binaries and preserves exact source bytes', () => {
  fixture(dir => {
    const first = build(dir)
    assert.equal(first.status, 0, first.stderr)
    const obsolete = join(dir, 'dist/vendor/obsolete/old.node')
    mkdirSync(dirname(obsolete), { recursive: true })
    writeFileSync(obsolete, 'stale')
    const sourceFile = join(dir, 'vendor/audio-capture/x64-linux/audio-capture.node')
    writeFileSync(sourceFile, 'official-updated-audio-native-module')
    const second = build(dir)
    assert.equal(second.status, 0, second.stderr)
    assertNoPackagingTemps(dir)
    assert.equal(existsSync(obsolete), false, 'Old native module leaked into fresh distribution')
    const sourceRoot = join(dir, 'vendor')
    const distRoot = join(dir, 'dist/vendor')
    const sourcePaths = walk(sourceRoot)
    assert.deepEqual(walk(distRoot), sourcePaths)
    const manifest = JSON.parse(readFileSync(join(dir, 'dist/integrity.json'), 'utf8'))
    assert.equal(manifest.version, '2.1.317')
    const packaged = manifest.files.filter(f => f.path.startsWith('vendor/'))
    assert.deepEqual(packaged.map(f => f.path).sort(), sourcePaths.map(p => 'vendor/' + p).sort())
    for (const entry of packaged) {
      const fromSource = readFileSync(join(dir, entry.path))
      const fromDist = readFileSync(join(dir, 'dist', entry.path))
      assert.deepEqual(fromDist, fromSource)
      assert.equal(entry.bytes, fromSource.length)
      assert.equal(entry.sha256, sha256(fromSource))
    }
  })
})

test('M1 C19-T03: invalid vendor symlink fails before existing distribution is replaced', () => {
  fixture(dir => {
    assert.equal(build(dir).status, 0)
    const manifestPath = join(dir, 'dist/integrity.json')
    const originalManifest = readFileSync(manifestPath)
    const outputVendor = join(dir, 'dist/vendor/audio-capture/x64-linux/audio-capture.node')
    const originalBytes = readFileSync(outputVendor)
    const outside = join(dir, 'outside-vendor')
    mkdirSync(outside)
    // Directory junctions work on Windows runners without symlink privilege.
    symlinkSync(outside, join(dir, 'vendor', 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir')
    const result = build(dir)
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr, /Vendor resource must be a regular file/)
    assert.deepEqual(readFileSync(outputVendor), originalBytes)
    assert.deepEqual(readFileSync(manifestPath), originalManifest)
    assertNoPackagingTemps(dir)
  })
})


test('M1 C19-T03: staging activation failure rolls back to the complete previously packaged vendor', () => {
  fixture(dir => {
    const first = build(dir)
    assert.equal(first.status, 0, first.stderr)
    const outputFile = join(dir, 'dist/vendor/audio-capture/x64-linux/audio-capture.node')
    const manifestPath = join(dir, 'dist/integrity.json')
    const originalFile = readFileSync(outputFile)
    const originalManifest = readFileSync(manifestPath)
    writeFileSync(join(dir, 'vendor/audio-capture/x64-linux/audio-capture.node'),
      'new-official-native-resource')
    const injection = join(dir, 'inject-vendor-failure.cjs')
    writeFileSync(injection, [
      "const fs = require('node:fs')",
      "const { syncBuiltinESMExports } = require('node:module')",
      "const originalRename = fs.renameSync",
"const { basename, dirname } = require('node:path')",
      "fs.renameSync = (from, to) => {",
"  if (basename(String(from)).startsWith('.vendor-stage-') && basename(String(to)) === 'vendor' && basename(dirname(String(to))) === 'dist') {",
      "    const error = new Error('simulated activation failure')",
      "    error.code = 'EACCES'",
      "    throw error",
      "  }",
      "  return originalRename(from, to)",
      "}",
      "syncBuiltinESMExports()",
    ].join('\n'))
    const failed = build(dir, injection)
    assert.notEqual(failed.status, 0, failed.stdout)
    assert.match(failed.stderr, /simulated activation failure/)
    assert.deepEqual(readFileSync(outputFile), originalFile,
      'Previous native binary must survive a failed activation')
    assert.deepEqual(readFileSync(manifestPath), originalManifest,
      'Previous integrity manifest must survive a failed activation')
    assertNoPackagingTemps(dir)
    const retried = build(dir)
    assert.equal(retried.status, 0, retried.stderr)
    assert.equal(readFileSync(outputFile, 'utf8'), 'new-official-native-resource')
    assertNoPackagingTemps(dir)
  })
})

test('M1 C19-T03: partial source copy fails before switching the previous release', () => {
  fixture(dir => {
    assert.equal(build(dir).status, 0)
    const outputFile = join(dir, 'dist/vendor/audio-capture/x64-linux/audio-capture.node')
    const originalFile = readFileSync(outputFile)
    const manifestPath = join(dir, 'dist/integrity.json')
    const originalManifest = readFileSync(manifestPath)
    const injection = join(dir, 'inject-copy-failure.cjs')
    writeFileSync(injection, [
      "const fs = require('node:fs')",
      "const { syncBuiltinESMExports } = require('node:module')",
      "const originalCopy = fs.cpSync",
      "fs.cpSync = (source, target, options) => {",
      "  if (String(target).includes('.vendor-stage-')) {",
      "    fs.mkdirSync(target, { recursive: true })",
      "    fs.writeFileSync(require('node:path').join(target, 'partial.bin'), 'partial')",
      "    throw new Error('simulated interrupted vendor copy')",
      "  }",
      "  return originalCopy(source, target, options)",
      "}",
      "syncBuiltinESMExports()",
    ].join('\n'))
    const failed = build(dir, injection)
    assert.notEqual(failed.status, 0, failed.stdout)
    assert.match(failed.stderr, /simulated interrupted vendor copy/)
    assert.deepEqual(readFileSync(outputFile), originalFile)
    assert.deepEqual(readFileSync(manifestPath), originalManifest)
    assertNoPackagingTemps(dir)
  })
})
