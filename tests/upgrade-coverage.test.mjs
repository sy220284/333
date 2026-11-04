import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoverage, verifyCoverageSnapshot } from '../build/upgrade-coverage.mjs';

const docs = new URL('../docs/upgrade/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, docs), 'utf8'));

test('2.1.317 机器源数据与覆盖快照逐条一致', () => {
  assert.deepEqual(verifyCoverageSnapshot(), { features: 102, scenarios: 84, tasks: 10 });
  const target = read('m1-evidence/target-release.json');
  const baseline = read('2.1.317-功能与场景源数据.json');
  const responsibility = read('2.1.317-任务责任表.json');
  const coverage = buildCoverage();
  assert.equal(target.target_version, '2.1.317');
  assert.equal(coverage.target_version, target.target_version);
  assert.equal(baseline.target_version, target.target_version);
  assert.equal(responsibility.source_plan, target.target_version);
  assert.deepEqual(baseline.features.map(x => [x.id, x.title]), coverage.features.map(x => [x.id, x.title]));
  assert.deepEqual(baseline.scenarios, coverage.scenarios);
});

test('M1/M10 和完整场景责任不能在移除旧版方案后丢失', () => {
  const coverage = buildCoverage();
  assert.ok(coverage.features.every(f => f.tasks.includes('M1') && f.tasks.includes('M10')));
  assert.ok(coverage.features.every(f => f.scenarios.length && f.status === 'UNVERIFIED'));
  assert.ok(coverage.scenarios.every(s => s.features.length > 0));
  for (const path of ['2.1.310-全面升级方案.md', '2.1.310-功能能力台账.md',
    '2.1.310-验收与迁移矩阵.md', '2.1.310-升级缺口与逐项核查清单.md']) {
    assert.equal(existsSync(new URL(path, docs)), false, '旧目标方案意外回流：' + path);
  }
});
