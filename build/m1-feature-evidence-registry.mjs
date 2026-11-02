import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=name=>JSON.parse(readFileSync(resolve(ROOT,name),'utf8'));
export function buildRegistry(cov,audit,exists=path=>existsSync(resolve(ROOT,path))) {
  assert.equal(cov.features.length,102);
  assert.equal(cov.scenarios.length,84);
  assert.equal(cov.counts.features,102);
  assert.equal(cov.counts.scenarios,84);
  assert.equal(audit.groups.length,18);
  assert.equal(audit.target_version,cov.target_version);
  const featureMap=new Map(cov.features.map(f=>[f.id,[]]));
  assert.equal(featureMap.size,102);
  assert.equal(new Set(audit.groups.map(g=>g.id)).size,18);
  assert.equal(new Set(cov.scenarios.map(s=>s.id)).size,84);
  for(const g of audit.groups) {
    assert.equal(g.acceptance,'UNVERIFIED','Source progress cannot sign M10 acceptance');
    assert.ok(g.features.length&&g.code.length&&g.remaining);
    for(const f of g.features) {
      assert.ok(featureMap.has(f),'Unknown capability '+f);
      featureMap.get(f).push(g.id);
    }
    for(const path of [...g.code,...g.tests]) assert.ok(exists(path),'Evidence file missing: '+path);
  }
  const features=cov.features.map(f=>({
    id:f.id,title:f.title,tasks:f.tasks,scenarios:f.scenarios,
    code_upgrade_groups:featureMap.get(f.id),acceptance:f.status,
  }));
  assert.ok(features.every(f=>f.acceptance==='UNVERIFIED'),
    'A verified entry needs explicit real M10 E2E signed proof');
  for(const s of cov.scenarios) for(const f of s.features)
    assert.ok(featureMap.has(f),'Unknown scenario capability '+f);
  return {schema:1,target_version:cov.target_version,
    counts:{features:102,scenarios:84,source_groups:18,
      features_with_code_groups:features.filter(f=>f.code_upgrade_groups.length).length,
      signed_features:0,signed_scenarios:0},
    groups:audit.groups,features,
    scenarios:cov.scenarios.map(s=>({...s,acceptance:'UNVERIFIED'})),
    note:'Source/CI/official target behavior are separately tracked; E2E acceptance is unsigned.'};
}
export const loadRegistry=()=>buildRegistry(
  read('docs/upgrade/upgrade-coverage.json'),
  read('docs/upgrade/m1-evidence/PR7-18组功能链证据审计.json'));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=loadRegistry();
  const idx=process.argv.indexOf('--report');
  if(idx>=0) {
    assert.ok(process.argv[idx+1]);
    const dest=resolve(process.argv[idx+1]);
    mkdirSync(dirname(dest),{recursive:true});
    writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
  }
  console.log(JSON.stringify(result.counts));
}
