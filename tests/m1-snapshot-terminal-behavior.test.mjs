import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const launcher = readFileSync(new URL('../src/dialogLaunchers.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('2.1.310 快照入口保持 keep 终态且不执行已退场组件', async () => {
  const match = launcher.match(
    /export async function launchSnapshotUpdateDialog\([\s\S]*?\): Promise<'merge' \| 'keep' \| 'replace'> \{([\s\S]*?)\n\}/,
  );
  assert.ok(match, '必须保留与调用方一致的签名');
  assert.doesNotMatch(match[1], /(?:await\s+import|showSetupDialog|SnapshotUpdateDialog|\bthrow\b)/);
  // Extract the actual function body and execute it without importing the TSX UI runtime.
  const execute = new Function('return async function recovered(_root, _props) {' + match[1] + '\n}')();
  for (const choice of [undefined, null, {}, { agentType: 'sample', scope: 'user', snapshotTimestamp: '2026-11-01' }]) {
    assert.equal(await execute(null, choice), 'keep');
  }
  assert.doesNotMatch(main, /import\(['"]\.\/components\/agents\/SnapshotUpdateDialog\.js['"]\)/);
  assert.match(main, /agentDef\.pendingSnapshotUpdate = undefined/);
});
