import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const official = process.env.CLAUDE_REFERENCE_BIN
const rebuilt = join(root, 'dist', process.platform === 'win32' ? 'claude.exe' : 'claude')
const median = items => [...items].sort((a, b) => a - b)[Math.floor(items.length / 2)]

test('M1 C19-T05: independently compiled CLI cold-start and help match verified native behavior', {
  skip: !official && 'Requires SHA-256 verified official platform executable',
  timeout: 180_000,
}, () => {
  assert.equal(existsSync(official), true, 'Missing verified original executable')
  assert.equal(existsSync(rebuilt), true, 'Missing rebuilt executable')
  const env = { ...process.env, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', NO_COLOR: '1', CI: 'true' }
  const results = {}
  for (const [label, flag] of [['cold-version', '--version'], ['help', '--help']]) {
    const measurements = { official: [], rebuilt: [] }
    for (const [name, exe] of [['official', official], ['rebuilt', rebuilt]]) {
      for (let i = 0; i < 7; i++) {
        const started = performance.now()
        const p = spawnSync(exe, [flag], {
          cwd: root, env, encoding: 'utf8', timeout: 20_000,
          maxBuffer: 4 * 1024 * 1024, windowsHide: true,
        })
        const elapsed = performance.now() - started
        assert.equal(p.error, undefined, name + ' ' + flag + ': ' + String(p.error))
        assert.equal(p.status, 0, name + ' ' + flag + ': ' + p.stderr)
        if (flag === '--version') assert.equal(p.stdout.trim(), `2.1.317 (${name === 'official' ? 'Claude Code' : '333'})`, name)
        else assert.match(p.stdout, /Usage:/)
        measurements[name].push(Number(elapsed.toFixed(2)))
      }
    }
    const firstOfficial = measurements.official[0]
    const firstRebuilt = measurements.rebuilt[0]
    const medOriginal = median(measurements.official.slice(1))
    const medRebuilt = median(measurements.rebuilt.slice(1))
    results[label] = {
      original_first_ms: firstOfficial,
      rebuilt_first_ms: firstRebuilt,
      original_median_ms: medOriginal,
      rebuilt_median_ms: medRebuilt,
      ratio: Number((medRebuilt / Math.max(medOriginal, 1)).toFixed(2)),
    }
    // Strict but runner-noise-tolerant: catch a genuine early-startup cycle,
    // debugger activation or cost explosion without failing a busy CI runner.
    const ceiling = flag === '--help' ? 3500 : 750
    assert.ok(medRebuilt <= Math.max(ceiling, medOriginal * 5),
      'Significant startup regression in ' + flag + ': ' + JSON.stringify(results[label]))
    assert.ok(firstRebuilt <= Math.max(ceiling * 2, firstOfficial * 8),
      'Significant cold-start regression: ' + JSON.stringify(results[label]))
  }
  console.log('M1 official 2.1.317 startup benchmarks: ' + JSON.stringify(results))
})
