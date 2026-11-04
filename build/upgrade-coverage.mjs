import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const doc = path => readFileSync(resolve(root, 'docs/upgrade', path), 'utf8');
const snapshot = resolve(root, 'docs/upgrade/upgrade-coverage.json');

function expandFeatures(scope) {
  const ids = new Set();
  for (const match of scope.matchAll(/F(\d{3})\s*[–-]\s*F(\d{3})/g)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    assert.ok(end >= start && end <= 102, 'Invalid task feature range');
    for (let n = start; n <= end; n++) ids.add('F' + String(n).padStart(3, '0'));
  }
  for (const match of scope.matchAll(/F\d{3}/g)) ids.add(match[0]);
  return [...ids].sort();
}

export function buildCoverage() {
  const target = JSON.parse(doc('m1-evidence/target-release.json'));
  const baseline = JSON.parse(doc('2.1.317-功能与场景源数据.json'));
  const assignment = JSON.parse(doc('2.1.317-任务责任表.json'));

  assert.match(target.target_version, /^2\.1\.\d+$/, 'Invalid upgrade target version');
  assert.equal(baseline.schema, 1);
  assert.equal(assignment.schema, 1);
  assert.equal(baseline.target_version, target.target_version, 'Functional baseline targets the wrong release');
  assert.equal(assignment.source_plan, target.target_version, 'Responsibility map targets the wrong release');
  assert.ok(Array.isArray(baseline.features) && Array.isArray(baseline.scenarios));
  assert.ok(Array.isArray(assignment.tasks));

  const listedFeatures = baseline.features;
  const scenarios = baseline.scenarios;
  const tasks = assignment.tasks.map(({id, feature_scope}) =>
    ({id, features: expandFeatures(feature_scope)}));
  const features = listedFeatures.map(feature => ({
    id: feature.id,
    title: feature.title,
    tasks: tasks.filter(task => task.features.includes(feature.id)).map(task => task.id),
    scenarios: scenarios.filter(scenario => scenario.features.includes(feature.id)).map(scenario => scenario.id),
    status: 'UNVERIFIED',
  }));

  assert.equal(features.length, 102, 'Capability count changed');
  assert.deepEqual(features.map(f => f.id), Array.from({length: 102}, (_, i) => 'F' + String(i + 1).padStart(3, '0')));
  assert.equal(scenarios.length, 84, 'Scenario count changed');
  assert.equal(scenarios.filter(s => s.id.startsWith('E')).length, 68);
  assert.equal(scenarios.filter(s => s.id.startsWith('L')).length, 16);
  assert.equal(new Set(scenarios.map(s => s.id)).size, 84, 'Duplicate scenario');
  assert.deepEqual(tasks.map(task => task.id), Array.from({length: 10}, (_, i) => 'M' + (i + 1)));
  for (const feature of features) {
    assert.ok(feature.scenarios.length > 0, feature.id + ' has no scenario');
    assert.ok(feature.tasks.includes('M1') && feature.tasks.includes('M10'), feature.id + ' has no M1/M10 responsibility');
    assert.ok(feature.tasks.length >= 2);
  }
  for (const scenario of scenarios) {
    assert.ok(scenario.features.length > 0, scenario.id + ' has no feature');
    for (const id of scenario.features) {
      assert.ok(features.some(feature => feature.id === id), scenario.id + ' has unknown feature ' + id);
    }
  }
  return {
    schema: 1,
    target_version: target.target_version,
    baseline_version: '2.1.88',
    status_semantics: 'Documentation linkage only; UNVERIFIED means no runtime feature acceptance',
    counts: { features: features.length, scenarios: scenarios.length, tasks: tasks.length },
    tasks, features, scenarios,
  };
}

export function verifyCoverageSnapshot() {
  const expected = buildCoverage();
  const actual = JSON.parse(readFileSync(snapshot, 'utf8'));
  assert.deepEqual(actual, expected, 'Upgrade matrix changed: regenerate with node build/upgrade-coverage.mjs --write');
  return expected.counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const coverage = buildCoverage();
    writeFileSync(snapshot, JSON.stringify(coverage, null, 2) + '\n');
    console.log('Updated upgrade coverage: ' + JSON.stringify(coverage.counts));
  } else {
    console.log('Verified upgrade coverage: ' + JSON.stringify(verifyCoverageSnapshot()));
  }
}
