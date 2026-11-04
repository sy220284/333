import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const native = join(root, 'vendor/clipboard-napi/x64-linux/clipboard-napi.node')
const source = join(root, 'src/ink/termio/clipboardNative317.mjs')

test('M1 C19-T04: standalone Bun bundle loads the packaged N-API addon and detects its absence', {
  skip: !(process.platform === 'linux' && process.arch === 'x64'),
}, () => {
  assert.ok(existsSync(native), 'The official x64 sync step must provide clipboard-napi.node')
  const temp = mkdtempSync(join(tmpdir(), '333-clipboard-bundle-317-'))
  try {
    const build = spawnSync('bun', ['build', source, '--target=bun', '--outdir', temp], {
      cwd: temp, encoding: 'utf8', timeout: 30_000,
    })
    assert.equal(build.error, undefined, build.error?.message)
    assert.equal(build.status, 0, build.stderr)
    const bundle = join(temp, 'clipboardNative317.js')
    assert.ok(existsSync(bundle), 'Bun did not emit the standalone clipboard module')
    const addon = join(temp, 'vendor/clipboard-napi/x64-linux/clipboard-napi.node')
    mkdirSync(join(temp, 'vendor/clipboard-napi/x64-linux'), { recursive: true })
    copyFileSync(native, addon)
    const script = 'import { isLinuxClipboardAddonLoadable } from ' +
      JSON.stringify(pathToFileURL(bundle).href) +
      "; console.log(isLinuxClipboardAddonLoadable() ? 'ADDON_OK' : 'ADDON_MISSING');"
    const run = () => spawnSync('bun', ['-e', script], {
      cwd: temp, encoding: 'utf8', timeout: 12_000,
      env: { ...process.env, DISABLE_TELEMETRY: '1' },
    })
    const available = run()
    assert.equal(available.status, 0, available.stderr)
    assert.match(available.stdout, /ADDON_OK/, 'Bundled code could not load the release native addon')
    renameSync(addon, addon + '.removed')
    const missing = run()
    assert.equal(missing.status, 0, missing.stderr)
    assert.match(missing.stdout, /ADDON_MISSING/, 'Missing optional addon should be reported')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('M1 C19-T04: self-contained 317 clipboard finds original addon through installed executable symlink', {
  skip: !(process.platform === 'linux' && process.arch === 'x64'),
  timeout: 90_000,
}, () => {
  assert.ok(existsSync(native), 'Verified x64 clipboard addon missing')
  const tempRoot = join(root, '.rebuild')
  mkdirSync(tempRoot, { recursive: true })
  const temp = mkdtempSync(join(tempRoot, 'clipboard-compiled-317-'))
  const entry = join(temp, 'clipboard-entry.mjs')
  const binary = join(temp, 'clipboard-check')
  const nativeCopy = join(temp, 'vendor/clipboard-napi/x64-linux/clipboard-napi.node')
  try {
    mkdirSync(join(temp, 'vendor/clipboard-napi/x64-linux'), { recursive: true })
    copyFileSync(native, nativeCopy)
    writeFileSync(entry,
      'import { isLinuxClipboardAddonLoadable } from ' +
      JSON.stringify(relative(temp, source).replaceAll('\\\\', '/')) +
      "; console.log(isLinuxClipboardAddonLoadable() ? 'ADDON_OK' : 'ADDON_MISSING');\\n")
    const built = spawnSync('bun', ['build', entry, '--compile', '--outfile', binary], {
      cwd: temp, encoding: 'utf8', timeout: 60_000,
    })
    assert.equal(built.error, undefined, String(built.error))
    assert.equal(built.status, 0, built.stderr)
    const aliasDir = join(temp, 'bin')
    mkdirSync(aliasDir)
    const alias = join(aliasDir, 'claude-clipboard')
    symlinkSync(binary, alias)
    const run = () => spawnSync(alias, [], {
      cwd: aliasDir, encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, DISABLE_TELEMETRY: '1' },
    })
    const available = run()
    assert.equal(available.status, 0, available.stderr)
    assert.match(available.stdout, /ADDON_OK/, 'Compiled symlink lost official native addon')
    renameSync(nativeCopy, nativeCopy + '.removed')
    const missing = run()
    assert.equal(missing.status, 0, missing.stderr)
    assert.match(missing.stdout, /ADDON_MISSING/, 'Missing original addon was masked')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
