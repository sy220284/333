import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {buildRegistry, loadRegistry} from '../build/m1-feature-evidence-registry.mjs'

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
const baseline = () => ({
  coverage: read('docs/upgrade/upgrade-coverage.json'),
  audit: read('docs/upgrade/m1-evidence/PR7-18组功能链证据审计.json'),
  signoffs: read('docs/upgrade/m1-evidence/PR7-M10-功能及场景签收.json'),
})

test('source groups can grow; 102 features and 84 scenarios remain unsigned until proof', () => {
  const registry = loadRegistry()
  const { audit } = baseline()
  assert.ok(registry.counts.source_groups >= 18)
  assert.deepEqual(
    [registry.counts.source_groups, registry.counts.features, registry.counts.scenarios],
    [audit.groups.length, 102, 84],
  )
  assert.equal(registry.counts.signed_features, 0)
  assert.equal(registry.counts.signed_scenarios, 0)
  assert.ok(registry.features.find(f => f.id === 'F034').code_upgrade_groups.includes('G04'))
})
test('source upgrade cannot silently sign M10', () => {
  const {coverage, audit, signoffs} = baseline()
  audit.groups[0].acceptance = 'VERIFIED'
  assert.throws(() => buildRegistry(coverage, audit, undefined, signoffs),
    /Code progress cannot automatically sign/)
})
test('evidence requires existing repo paths and known F IDs', () => {
  const {coverage, audit, signoffs} = baseline()
  audit.groups[0].code = ['src/invalid_m1_contract.ts']
  assert.throws(() => buildRegistry(coverage, audit, undefined, signoffs),
    /Evidence file missing/)
  audit.groups[0].code = ['src/main.tsx']
  audit.groups[0].features = ['F999']
  assert.throws(() => buildRegistry(coverage, audit, undefined, signoffs),
    /Unknown capability/)
})
test('a signed capability requires complete target, candidate, differential and review evidence', () => {
  const {coverage, audit, signoffs} = baseline()
  signoffs.features = [{id: 'F034', status: 'VERIFIED'}]
  assert.throws(() => buildRegistry(coverage, audit, undefined, signoffs),
    /official executable mismatch/)
})
test('signoff cannot count a passed feature when its E/L scenario is missing', () => {
  const {coverage, audit, signoffs} = baseline()
  const proof = id => ({
    id, status: 'VERIFIED',
    official: {executable_sha256: 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56',
      source_anchor: 'chunk-j0tbz6ra.js:83810', result: 'PASS',
      report: 'docs/upgrade/m1-evidence/F034-Notebook-官方x64-E41实测.json'},
    rebuilt: {commit_sha: 'a'.repeat(40),
      ci_run: 'https://github.com/sy220284/333/actions/runs/41439617990', result: 'PASS',
      report: 'docs/upgrade/m1-evidence/M10-test-candidate.json'},
    parity: {result: 'PASS',
      report: 'docs/upgrade/m1-evidence/M10-test-parity.json'},
    review: {signed_at: '2026-11-02T13:00:00Z', reviewer: 'M10-test-fixture'},
  })
  signoffs.features = [proof('F034')]
  assert.throws(() => buildRegistry(coverage, audit, () => true, signoffs),
    /before all linked E\/L scenes/)
  signoffs.scenarios = [proof('E41')]
  const accepted = buildRegistry(coverage, audit, () => true, signoffs)
  assert.equal(accepted.counts.signed_features, 1)
  assert.equal(accepted.counts.signed_scenarios, 1)
})
test('a signed scenario cannot omit another required feature', () => {
  const {coverage, audit, signoffs} = baseline()
  signoffs.scenarios = [{id: 'E46', status: 'VERIFIED'}]
  assert.throws(() => buildRegistry(coverage, audit, undefined, signoffs),
    /official executable mismatch/)
})

test('separate official, rebuilt and parity reports are required for M10 proof', () => {
  const {coverage, audit, signoffs} = baseline()
  signoffs.features = [{
    id: 'F034',
    status: 'VERIFIED',
    official: {
      executable_sha256: 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56',
      source_anchor: 'chunk-j0tbz6ra.js:83810', result: 'PASS',
      report: 'docs/upgrade/m1-evidence/F034-Notebook-官方x64-E41实测.json',
    },
    rebuilt: {
      commit_sha: 'a'.repeat(40),
      ci_run: 'https://github.com/sy220284/333/actions/runs/41439617990',
      result: 'PASS', report: 'docs/upgrade/m1-evidence/F034-Notebook-官方x64-E41实测.json',
    },
    parity: {
      result: 'PASS',
      report: 'docs/upgrade/m1-evidence/F034-Notebook-官方x64-E41实测.json',
    },
    review: {signed_at: '2026-11-02T13:00:00Z', reviewer: 'M10-test-fixture'},
  }]
  assert.throws(() => buildRegistry(coverage, audit, () => true, signoffs),
    /target, candidate and difference reports must be independent/)
})
test('new upgrade groups extend the evidence list without a fixed 18-group cap', () => {
  const {coverage, audit, signoffs} = baseline()
  const nextGroupId = 'G' + String(audit.groups.length + 1).padStart(2, '0')
  audit.groups.push({
    id: nextGroupId, name: '新增源码升级组',
    features: ['F001'], code: ['src/main.tsx'], tests: [],
    stage: 'SOURCE_CONNECTED', acceptance: 'UNVERIFIED',
    remaining: '仍需目标版和重建版真实运行对照',
  })
  const next = buildRegistry(coverage, audit, undefined, signoffs)
  assert.equal(next.counts.source_groups, audit.groups.length)
  assert.ok(next.features.find(f => f.id === 'F001').code_upgrade_groups.includes(nextGroupId))
})
