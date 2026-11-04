import assert from 'node:assert/strict'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const doc = path => JSON.parse(readFileSync(resolve(root, 'docs/upgrade', path), 'utf8'))
const snapshot = resolve(root, 'docs/upgrade/upgrade-coverage.json')
const idSequence = (prefix, start, end, digits) =>
  Array.from({length:end-start+1}, (_, i) => prefix + String(start+i).padStart(digits, '0'))

export function buildCoverage() {
  const target = doc('m1-evidence/target-release.json')
  const baseline = doc('2.1.317-功能与场景源数据.json')
  const implementation = doc('2.1.317-六层完整功能链路.json')
  assert.equal(target.target_version, '2.1.317')
  assert.equal(implementation.target_version, target.target_version)
  assert.equal(baseline.target_version, target.target_version)
  assert.equal(implementation.layers.length, 6)
  assert.equal(implementation.routes.length, 20)
  assert.deepEqual(implementation.layers.map(x => x.id), idSequence('M',1,6,1))
  assert.deepEqual([...implementation.routes.map(x => x.id)].sort(), idSequence('C',1,20,2))
  assert.deepEqual(implementation.layers.map(x => x.index),[0,1,2,3,4,5])
  const routeMap = new Map(implementation.routes.map(x => [x.id,x]))
  const taskSet = new Set(implementation.layers.map(x => x.id))
  const allChains = implementation.layers.flatMap(layer => layer.chain_ids)
  assert.equal(new Set(allChains).size, 20, '功能链不能分配到多张任务卡')
  const layerMap = new Map(implementation.layers.map(layer => [layer.id,layer]))
  for(const layer of implementation.layers) {
    assert.ok(layer.chain_ids.length, layer.id+' has no functionality')
    for(const parent of layer.requires) {
      assert.ok(taskSet.has(parent) && layerMap.get(parent).index < layer.index, layer.id+' dependency cycle')
    }
    for(const id of layer.chain_ids) assert.equal(routeMap.get(id)?.layer,layer.id,id+' wrong owner')
  }
  const featureByRoute = new Map()
  for(const route of implementation.routes) {
    assert.ok(taskSet.has(route.layer) && layerMap.get(route.layer).index===route.layer_index)
    assert.ok(route.flow.length>=3 && route.required_semantics.length>=6 && route.acceptance.length>0)
    assert.ok(route.implementation_strategy.length>=4)
    assert.ok(route.source_candidates.length>=2, route.id+' missing source consumers')
    for(const path of route.source_candidates) {
      assert.ok(path.startsWith('src/')||path.startsWith('build/'), route.id+': '+path)
      assert.ok(existsSync(resolve(root,path)), route.id+': source candidate missing '+path)
    }
    for(const id of route.baseline_feature_ids) {
      assert.match(id,/^F\d{3}$/)
      assert.ok(!featureByRoute.has(id), id+' assigned to multiple primary chains')
      featureByRoute.set(id,route)
    }
  }
  assert.ok(baseline.features.length>=102 && baseline.scenarios.length>=84)
  assert.deepEqual(baseline.features.slice(0,102).map(x=>x.id),idSequence('F',1,102,3))
  assert.deepEqual(baseline.scenarios.slice(0,68).map(x=>x.id),idSequence('E',1,68,2))
  assert.deepEqual(baseline.scenarios.slice(68,84).map(x=>x.id),idSequence('L',1,16,2))
  assert.equal(new Set(baseline.features.map(x=>x.id)).size,baseline.features.length)
  assert.equal(new Set(baseline.scenarios.map(x=>x.id)).size,baseline.scenarios.length)
  assert.deepEqual([...featureByRoute.keys()].sort(),baseline.features.map(x=>x.id).sort(),
    '每个既有功能必须归属一条新版主功能链')
  const scenarios = baseline.scenarios
  const features = baseline.features.map(feature => {
    const route = featureByRoute.get(feature.id)
    const linked = scenarios.filter(s=>s.features.includes(feature.id)).map(s=>s.id)
    assert.ok(linked.length,feature.id+' has no regression scenario')
    return {id:feature.id,title:feature.title,chain:route.id,tasks:[route.layer],
      scenarios:linked,status:'UNVERIFIED'}
  })
  for(const scenario of scenarios) {
    assert.ok(scenario.features.length,scenario.id+' has no function')
    for(const id of scenario.features) assert.ok(featureByRoute.has(id),scenario.id+' unknown '+id)
  }
  const tasks = implementation.layers.map(layer => ({
    id:layer.id,name:layer.title,layer_index:layer.index,requires:layer.requires,
    routes:layer.chain_ids,
    features:features.filter(f=>f.tasks.includes(layer.id)).map(f=>f.id)
  }))
  const chains = implementation.routes.map(route => ({
    id:route.id,name:route.name,layer:route.layer,features:route.baseline_feature_ids,
    status:route.status
  }))
  return {
    schema:2,target_version:target.target_version,baseline_version:'2.1.88',
    status_semantics:'20条新版完整功能链分六层实施，102/84仅为历史回归下限；UNVERIFIED不代表真实执行通过',
    counts:{features:features.length,scenarios:scenarios.length,tasks:tasks.length,chains:chains.length},
    tasks,chains,features,scenarios
  }
}
export function verifyCoverageSnapshot() {
  const expected=buildCoverage()
  const actual=JSON.parse(readFileSync(snapshot,'utf8'))
  assert.deepEqual(actual,expected,'六层功能链覆盖快照不一致，执行 node build/upgrade-coverage.mjs --write')
  return expected.counts
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--write')) {
    const data=buildCoverage()
    writeFileSync(snapshot,JSON.stringify(data,null,2)+'\n')
    console.log('Updated 2.1.317 six-layer coverage: '+JSON.stringify(data.counts))
  } else console.log('Verified 2.1.317 six-layer coverage: '+JSON.stringify(verifyCoverageSnapshot()))
}
