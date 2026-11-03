import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoverage, verifyCoverageSnapshot } from '../build/upgrade-coverage.mjs';

test('M1 coverage source and snapshot agree for every F/M/E/L link', () => {
  const counts = verifyCoverageSnapshot();
  assert.deepEqual(counts, { features: 102, scenarios: 84, tasks: 10 });
  const target = JSON.parse(readFileSync(new URL('../docs/upgrade/m1-evidence/target-release.json', import.meta.url), 'utf8'));
  assert.equal(buildCoverage().target_version, target.target_version);
});
test('M1 ledger requires every feature to have responsibility and runnable scenarios', () => {
  const coverage = buildCoverage();
  assert.ok(coverage.features.every(f => f.tasks.includes('M1') && f.tasks.includes('M10')));
  assert.ok(coverage.features.every(f => f.scenarios.length && f.status === 'UNVERIFIED'));
  assert.ok(coverage.scenarios.every(s => s.features.length > 0));
});
