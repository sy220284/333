import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

function run(script: string) {
  const result = spawnSync('bun', ['-e', `import assert from 'node:assert/strict'; ${script}`], {
    encoding: 'utf8', timeout: 20000, env: process.env,
  })
  assert.equal(result.status, 0, result.stderr)
}

test('317 per-model effort settings preserve source precedence and canonical keys', () => run(`
  import { buildEffortSettingsTable, lookupSettingsEffort } from './src/utils/effortSettings.ts';
  const table = buildEffortSettingsTable([
    { source: 'userSettings', settings: { effortLevel: 'low', modelSettings: { 'opus': { effortLevel: 'high' }, 'claude-opus-5-5': { effortLevel: 'xhigh' } } } },
    { source: 'projectSettings', settings: { effortLevel: 'medium' } },
    { source: 'flagSettings', settings: { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } } },
  ]);
  assert.equal(lookupSettingsEffort(table, 'claude-opus-5-5'), 'medium');
  assert.equal(lookupSettingsEffort(table, 'sonnet'), 'high');
  assert.equal(lookupSettingsEffort(table, 'claude-haiku-5-5'), 'medium');
  const keys = buildEffortSettingsTable([{ source: 'userSettings', settings: { modelSettings: { 'opus': { effortLevel: 'low' }, 'claude-opus-5-5': { effortLevel: 'xhigh' } } } }]);
  assert.equal(lookupSettingsEffort(keys, 'OPUS'), 'xhigh');
`))

test('317 legacy user effort does not pin newly introduced model generations', () => run(`
  import { buildEffortSettingsTable, lookupSettingsEffort } from './src/utils/effortSettings.ts';
  const table = buildEffortSettingsTable([{ source: 'userSettings', settings: { effortLevel: 'low' } }]);
  assert.equal(lookupSettingsEffort(table, 'claude-opus-4-6'), 'low');
  assert.equal(lookupSettingsEffort(table, 'my-custom-deployment'), 'low');
  assert.equal(lookupSettingsEffort(table, 'claude-opus-5-5'), undefined);
  assert.equal(lookupSettingsEffort(table, 'claude-sonnet-5-5'), undefined);
  assert.equal(lookupSettingsEffort(table, 'claude-haiku-5-5'), undefined);
`))

test('317 persistence writes only the selected canonical model and guards prototype names', () => run(`
  import { modelEffortSettingsUpdate } from './src/utils/effortSettings.ts';
  assert.deepEqual(modelEffortSettingsUpdate('opus', 'xhigh'), { modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } });
  assert.deepEqual(modelEffortSettingsUpdate('claude-opus-5-5', 'max'), { modelSettings: { 'claude-opus-5-5': { effortLevel: undefined } } });
  assert.deepEqual(modelEffortSettingsUpdate('__proto__', 'medium'), { effortLevel: 'medium' });
`))
