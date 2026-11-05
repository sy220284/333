import assert from 'node:assert/strict'
import {test} from 'node:test'
import {commandNames,compare317} from '../build/compare-317.mjs'
test('CLI command extraction excludes options and includes exact subcommands',()=>{
 assert.deepEqual(commandNames(".command('plugin').option('--foo').command('mcp help').command('auth')"),['plugin','mcp','auth'])
})
test('对照317完整代码清单，展示真实缺口而非自动标记完成',()=>{
 const report=compare317()
 assert.equal(report.target,'2.1.317')
 assert.equal(report.counts.features,137)
 assert.equal(report.counts.scenarios,137)
 assert.equal(report.counts.chains,20)
 assert.equal(report.counts.layers,6)
 assert.ok(report.counts.source_files_scanned>500)
 assert.ok(report.cli.official_root_commands>=18)
 assert.equal(new Set(report.features.map(x=>x.id)).size,137)
 assert.ok(report.features.every(x=>x.owner.startsWith('M')&&x.chain.startsWith('C')))
})

test('已注册的317 CLI子命令不因旧提示词字面匹配误报缺失，也不直接视为功能签收',()=>{
 const report=compare317()
 for(const id of ['F121','F135','F136']){
  const f=report.features.find(f=>f.id===id)
  assert.equal(f?.state,'CLI_ENTRY_PRESENT_REQUIRES_RUNTIME_PARITY',id)
  assert.ok(f.commands?.length>0,id)
  assert.ok(!String(f.state).includes('VERIFIED'),id)
 }
 assert.equal(report.counts.cli_entries_registered,3)
})
