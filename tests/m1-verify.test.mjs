import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
const root=resolve(import.meta.dirname,'..');
const script=resolve(root,'build/m1-verify.mjs');
test('M1 requires complete 90/61/6313 source-index coverage and preserved responsibility',()=>{
  const result=JSON.parse(execFileSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:30000}));
  assert.deepEqual(result.total,{flags:90,anchors:61,changes:6313,versions:180,feature_links:102,scenario_links:84});
  assert.equal(result.m1_closed,false,'Static location must never imply complete M1 acceptance');
});
test('M1 refuses to mark task closed until every target behavior and runtime case is validated',()=>{
  const r=spawnSync(process.execPath,[script,'--require-closed'],{cwd:root,encoding:'utf8',timeout:30000});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/M1 acceptance denied/);
});
