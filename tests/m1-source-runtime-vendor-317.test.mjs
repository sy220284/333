import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { stageRuntimeVendor317 } from '../build/stage-runtime-vendor317.mjs'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), '317-source-runtime-'))
  const host = process.arch + '-' + process.platform
  const rg = 'ripgrep/' + host + '/' + (process.platform === 'win32' ? 'rg.exe' : 'rg')
  const audio = 'audio-capture/' + host + '/audio-capture.node'
  for (const [file, text] of [
    ['ripgrep/COPYING', 'verified license'],
    [rg, 'verified executable'],
    [audio, 'verified native module'],
  ]) {
    const dest = join(root, 'vendor', file)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, text)
  }
  if (process.platform !== 'win32') chmodSync(join(root, 'vendor', rg), 0o755)
  mkdirSync(join(root, 'dist'), { recursive: true })
  try { run({ root, rg, audio, host }) }
  finally { rmSync(root, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 }) }
}

test('317 source-mode binary gets exactly the verified host native resources before tests', () => fixture(({root,rg,audio,host}) => {
  const done = stageRuntimeVendor317(root)
  assert.equal(done.host, host)
  assert.ok(done.files.includes(rg) && done.files.includes(audio))
  for (const file of done.files) {
    assert.deepEqual(readFileSync(join(root,'vendor',file)), readFileSync(join(root,'dist/vendor',file)))
  }
  if (process.platform !== 'win32') {
    assert.ok(statSync(join(root,'dist/vendor',rg)).mode & 0o111)
  }
  assert.equal(existsSync(join(root,'dist/vendor/ripgrep',host==='arm64-linux'?'x64-linux':'arm64-linux')),false)
}))

test('317 source vendor staging is repeatable, transactional and rejects non-files', () => fixture(({root,rg,audio}) => {
  stageRuntimeVendor317(root)
  const previous = readFileSync(join(root,'dist/vendor',audio))
  writeFileSync(join(root,'vendor',rg),'new native verified bits')
  if (process.platform !== 'win32') chmodSync(join(root,'vendor',rg),0o755)
  stageRuntimeVendor317(root)
  assert.equal(readFileSync(join(root,'dist/vendor',rg),'utf8'),'new native verified bits')
  rmSync(join(root,'vendor',audio))
  mkdirSync(join(root,'vendor',audio))
  assert.throws(() => stageRuntimeVendor317(root),/Missing or invalid 2\.1\.317 vendor resource/)
  assert.deepEqual(readFileSync(join(root,'dist/vendor',audio)), previous)
  assert.deepEqual(readdirSync(join(root,'dist')).filter(x=>x.startsWith('.vendor-runtime-')),[])
}))
