import assert from 'node:assert/strict'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
const PINNED_OFFICIAL = 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56'
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const SIGNATURE = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/
const ALLOWED_CI_URL = /^https:\/\/github\.com\/sy220284\/333\/actions\/runs\/\d+$/

function checkProof(record, kind, exists) {
  assert.equal(record.status, 'VERIFIED', kind + ': only explicit verification is accepted')
  assert.equal(record.official?.executable_sha256, PINNED_OFFICIAL, kind + ': official executable mismatch')
  assert.match(record.official?.source_anchor ?? '', /chunk-[a-z0-9]+\.js:\d+/, kind + ': missing source anchor')
  assert.match(record.rebuilt?.commit_sha ?? '', COMMIT_PATTERN, kind + ': missing candidate commit')
  assert.match(record.rebuilt?.ci_run ?? '', ALLOWED_CI_URL, kind + ': missing actual CI run')
  assert.equal(record.official?.result, 'PASS', kind + ': official reference not passed')
  assert.equal(record.rebuilt?.result, 'PASS', kind + ': candidate not passed')
  assert.equal(record.parity?.result, 'PASS', kind + ': actual differential not passed')
  assert.match(record.review?.signed_at ?? '', SIGNATURE, kind + ': unsigned timestamp')
  assert.ok(typeof record.review?.reviewer === 'string' && record.review.reviewer.trim(),
    kind + ': missing signed reviewer')
  const reports = [record.official.report, record.rebuilt.report, record.parity.report]
  assert.equal(new Set(reports).size, 3, kind + ': target, candidate and difference reports must be independent')
  for (const file of reports) {
    assert.ok(typeof file === 'string' && file.startsWith('docs/upgrade/m1-evidence/'),
      kind + ': report must be an audited repository evidence path')
    assert.ok(exists(file), kind + ': missing evidence file ' + file)
  }
}

export function buildRegistry(
  coverage,
  audit,
  exists = path => existsSync(resolve(ROOT, path)),
  signoffs = {schema: 1, target_version: '2.1.310', features: [], scenarios: []},
) {
  assert.equal(coverage.features.length, 102)
  assert.equal(coverage.scenarios.length, 84)
  assert.equal(coverage.counts.features, 102)
  assert.equal(coverage.counts.scenarios, 84)
  assert.ok(audit.groups.length >= 18, 'The existing 18 groups are the historical minimum, not a feature ceiling')
  assert.equal(audit.target_version, coverage.target_version)
  assert.equal(signoffs.schema, 1)
  assert.equal(signoffs.target_version, coverage.target_version)
  assert.ok(Array.isArray(signoffs.features) && Array.isArray(signoffs.scenarios))
  const featureMap = new Map(coverage.features.map(f => [f.id, []]))
  const scenarioMap = new Map(coverage.scenarios.map(s => [s.id, s]))
  assert.equal(featureMap.size, 102)
  assert.equal(scenarioMap.size, 84)
  assert.equal(new Set(audit.groups.map(g => g.id)).size, audit.groups.length, 'Duplicate upgrade group IDs')
  for (const group of audit.groups) {
    assert.equal(group.acceptance, 'UNVERIFIED', 'Code progress cannot automatically sign off M10')
    assert.ok(group.features.length && group.code.length && group.remaining)
    for (const feature of group.features) {
      assert.ok(featureMap.has(feature), 'Unknown capability ' + feature)
      featureMap.get(feature).push(group.id)
    }
    for (const path of [...group.code, ...group.tests]) {
      assert.ok(exists(path), 'Evidence file missing: ' + path)
    }
  }

  const signedFeatures = new Map()
  for (const signoff of signoffs.features) {
    assert.ok(featureMap.has(signoff.id), 'Unknown signed feature ' + signoff.id)
    assert.ok(!signedFeatures.has(signoff.id), 'Duplicate feature signature ' + signoff.id)
    assert.ok(featureMap.get(signoff.id).length > 0,
      'A feature cannot be signed without an identified source upgrade chain: ' + signoff.id)
    checkProof(signoff, 'feature ' + signoff.id, exists)
    signedFeatures.set(signoff.id, signoff)
  }

  const signedScenarios = new Map()
  for (const signoff of signoffs.scenarios) {
    assert.ok(scenarioMap.has(signoff.id), 'Unknown signed scenario ' + signoff.id)
    assert.ok(!signedScenarios.has(signoff.id), 'Duplicate scenario signature ' + signoff.id)
    checkProof(signoff, 'scenario ' + signoff.id, exists)
    const scenario = scenarioMap.get(signoff.id)
    for (const feature of scenario.features) {
      assert.ok(signedFeatures.has(feature),
        'Scenario cannot pass while a dependent feature is unsigned: ' + signoff.id + '/' + feature)
    }
    signedScenarios.set(signoff.id, signoff)
  }
  for (const feature of signedFeatures.keys()) {
    const entry = coverage.features.find(f => f.id === feature)
    for (const scenario of entry.scenarios) {
      assert.ok(signedScenarios.has(scenario),
        'Feature cannot be fully accepted before all linked E/L scenes: ' + feature + '/' + scenario)
    }
  }

  const features = coverage.features.map(feature => ({
    id: feature.id,
    title: feature.title,
    tasks: feature.tasks,
    scenarios: feature.scenarios,
    code_upgrade_groups: featureMap.get(feature.id),
    acceptance: signedFeatures.has(feature.id) ? 'VERIFIED' : 'UNVERIFIED',
    evidence: signedFeatures.get(feature.id) ?? null,
  }))
  const scenarios = coverage.scenarios.map(scenario => ({
    ...scenario,
    acceptance: signedScenarios.has(scenario.id) ? 'VERIFIED' : 'UNVERIFIED',
    evidence: signedScenarios.get(scenario.id) ?? null,
  }))
  for (const scenario of scenarios) {
    for (const id of scenario.features) assert.ok(featureMap.has(id), 'Unknown scenario capability ' + id)
  }
  return {
    schema: 2,
    target_version: coverage.target_version,
    counts: {
      features: features.length,
      scenarios: scenarios.length,
      source_groups: audit.groups.length,
      features_with_code_groups: features.filter(f => f.code_upgrade_groups.length).length,
      signed_features: signedFeatures.size,
      signed_scenarios: signedScenarios.size,
    },
    groups: audit.groups,
    features,
    scenarios,
    note: 'A focused test is only source progress; M10 signatures require source, official, rebuilt, differential and E/L evidence.',
  }
}

export const loadRegistry = () => buildRegistry(
  read('docs/upgrade/upgrade-coverage.json'),
  read('docs/upgrade/m1-evidence/PR7-18组功能链证据审计.json'),
  path => existsSync(resolve(ROOT, path)),
  read('docs/upgrade/m1-evidence/PR7-M10-功能及场景签收.json'),
)

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = loadRegistry()
  const index = process.argv.indexOf('--report')
  if (index >= 0) {
    assert.ok(process.argv[index + 1])
    const destination = resolve(process.argv[index + 1])
    mkdirSync(dirname(destination), {recursive: true})
    writeFileSync(destination, JSON.stringify(result, null, 2) + '\n')
  }
  console.log(JSON.stringify(result.counts))
}
