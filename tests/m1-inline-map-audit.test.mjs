import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const script = resolve(import.meta.dirname, '../build/m1-inline-source-map-audit.py')

test('旧源码内嵌 Source Map 可原样解码并禁止覆盖产品', () => {
  const work = mkdtempSync(join(tmpdir(), 'm1-inline-map-'))
  try {
    const source = join(work, 'old-src')
    const recovered = join(work, 'snapshots')
    const output = join(work, 'report.json')
    mkdirSync(source)
    const old = 'export function goNext() { return true }\n'
    const raw = Buffer.from(JSON.stringify({
      version: 3, sources: ['WizardProvider.tsx'], sourcesContent: [old], mappings: '',
    })).toString('base64')
    writeFileSync(join(source, 'WizardProvider.tsx'),
      'function a(){return true}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' + raw)
    execFileSync('python3', [script, '--source-dir', source, '--output', output,
      '--recover-dir', recovered], { encoding: 'utf8', timeout: 10000 })
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.files_with_inline_maps, 1)
    assert.equal(report.original_sources_recovered, 1)
    assert.equal(report.original_characters, old.length)
    assert.equal(report.records[0].sources[0].original_source_path, 'WizardProvider.tsx')
    assert.equal(readFileSync(join(recovered, 'WizardProvider.tsx', 'source-0.tsx'), 'utf8'), old)
    assert.equal(existsSync(join(source, 'WizardProvider.tsx')), true)
    const unsafe = spawnSync('python3', [script, '--source-dir', source, '--output', output,
      '--recover-dir', source], { encoding: 'utf8', timeout: 10000 })
    assert.notEqual(unsafe.status, 0)
    assert.match(unsafe.stderr, /禁止原地覆盖/)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})

test('错误的内嵌Source Map不得静默跳过', () => {
  const work = mkdtempSync(join(tmpdir(), 'm1-inline-map-invalid-'))
  try {
    writeFileSync(join(work, 'broken.tsx'),
      'const x=1;\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,Z@')
    const run = spawnSync('python3', [script, '--source-dir', work,
      '--output', join(work, 'out.json')], { encoding: 'utf8', timeout: 10000 })
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /Traceback|Error/)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})
