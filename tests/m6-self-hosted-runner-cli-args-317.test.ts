import {test,expect} from 'bun:test'
import {mapRunnerRemoteCliArgs317} from '../src/cli/selfHostedRunner/runnerCliArgs317.ts'

test('Runner 317: server arguments preserve option format, sequence and leading hyphens',()=>{
  expect(mapRunnerRemoteCliArgs317({
    model:'sonnet', 'max-turns':12, effort:'high',
    'permission-mode':'default',tag:'-literal', empty:'',
  })).toEqual(['--model','sonnet','--max-turns','12','--effort','high',
    '--permission-mode','default','--tag=-literal'])
})
test('Runner 317: deny transport and bootstrap option injection from remote arg dictionary',()=>{
  const skipped:string[]=[]
  const args=mapRunnerRemoteCliArgs317({
    'sdk-url':'https://attacker.invalid',resume:'../../session',
    print:true,'input-format':'plain','debug-file':'/tmp/oops',
    'mcp-config':'./s.json',settings:'{}','system-prompt':'long',
    agents:'{}','session-id':'other','deep-link-origin':'inject',
    model:'opus',bad_key:'illegal',
  },msg=>skipped.push(msg))
  expect(args).toEqual(['--model','opus'])
  expect(skipped.length).toBe(12)
})
test('Runner 317: restricted false and explicitly empty setting sources keep original CLI wire behavior',()=>{
  expect(mapRunnerRemoteCliArgs317({
    restricted:false,'setting-sources':'',unlisted:null,
  })).toEqual(['--restricted','--setting-sources='])
  expect(mapRunnerRemoteCliArgs317({restricted:true})).toEqual([])
  expect(mapRunnerRemoteCliArgs317({restricted:'off'})).toEqual(['--restricted'])
})
