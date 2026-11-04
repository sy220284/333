import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const lock = JSON.parse(readFileSync(resolve(root, 'build/public-dependencies.lock.json'), 'utf8'))
const exporterPath = 'node_modules/@opentelemetry/exporter-prometheus'

test('Prometheus exporter is patched with an integrity-pinned and peer-compatible SDK', () => {
  const packages = lock.packages
  assert.equal(packages[''].dependencies['@opentelemetry/exporter-prometheus'], '0.217.0')
  const exporter = packages[exporterPath]
  assert.equal(exporter.version, '0.217.0')
  assert.match(exporter.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  assert.equal(packages['node_modules/@opentelemetry/api'].version, '1.9.0')
  for (const name of ['core', 'resources', 'sdk-metrics']) {
    const nested = packages[exporterPath + '/node_modules/@opentelemetry/' + name]
    assert.equal(nested?.version, '2.7.1', 'missing compatible ' + name)
    assert.match(nested.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  }
})

test('Prometheus HTTP server returns 400 for malformed URL without crashing', { timeout: 30000 }, () => {
  const child = resolve(root, 'tests/fixtures/m1-prometheus-server-child.mjs')
  const run = spawnSync(process.execPath, [child], {
    cwd: root, encoding: 'utf8', timeout: 18000, maxBuffer: 1024 * 1024,
  })
  assert.equal(run.error, undefined, run.error?.message)
  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.deepEqual(JSON.parse(run.stdout.trim()), {
    malformed: 400, valid: 200, counter: true,
  })
})
