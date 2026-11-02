import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildRegistry,loadRegistry} from '../build/m1-feature-evidence-registry.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('18 groups map into 102 features/84 scenarios without false sign-off',()=>{
  const r=loadRegistry();
  assert.deepEqual([r.counts.source_groups,r.counts.features,r.counts.scenarios],[18,102,84]);
  assert.equal(r.counts.signed_features,0);
  assert.ok(r.features.find(f=>f.id==='F034').code_upgrade_groups.includes('G04'));
});
test('source upgrade cannot silently sign M10',()=>{
  const c=read('docs/upgrade/upgrade-coverage.json');
  const a=read('docs/upgrade/m1-evidence/PR7-18组功能链证据审计.json');
  a.groups[0].acceptance='VERIFIED';
  assert.throws(()=>buildRegistry(c,a),/Source progress cannot sign/);
});
test('audit must reference actual paths and known F IDs',()=>{
  const c=read('docs/upgrade/upgrade-coverage.json');
  const a=read('docs/upgrade/m1-evidence/PR7-18组功能链证据审计.json');
  a.groups[0].code=['src/invalid_m1_contract.ts'];
  assert.throws(()=>buildRegistry(c,a),/Evidence file missing/);
  a.groups[0].code=['src/main.tsx'];
  a.groups[0].features=['F999'];
  assert.throws(()=>buildRegistry(c,a),/Unknown capability/);
});
