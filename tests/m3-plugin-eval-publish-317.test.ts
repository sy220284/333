import {test,expect} from 'bun:test'
import {publishEvalReport317,shouldPublishEvalReport317} from '../src/cli/handlers/pluginEvalPublish317.ts'
const report={score:1,costUsd:0.12,cases:[{name:'case A',score:1,runs:[{
  arm:'with',repeat:1,score:1,output:'pass',error:null}]}],suite:{root:'/tmp/example'}}
test('remote report flags reproduce explicit no-publish conflict',()=>{
  expect(shouldPublishEvalReport317({publishReport:true})).toBe(true)
  expect(shouldPublishEvalReport317({publishReport:false})).toBe(false)
  expect(()=>shouldPublishEvalReport317({publishReport:true,publish:false})).toThrow()
})
test('publish-report submits private report using Claude.ai OAuth and returns real URL',async()=>{
  let received:any
  const lines:string[]=[]
  const output=await publishEvalReport317(report,{publishReport:true},{
    credentials:async()=>({accessToken:'oauth-test',orgUUID:'org-1'}),
    fetchImpl:async (url,init)=>{
      received={url,init}
      return Response.json({slug:'test-report-1'})
    },
    onStatus:message=>lines.push(message)
  })
  expect(output).toEqual({status:'published',url:'https://claude.ai/artifacts/test-report-1'})
  expect(received.url).toBe('https://api.anthropic.com/api/frame/deploy/direct')
  expect(received.init.headers.authorization).toBe('Bearer oauth-test')
  const body=JSON.parse(received.init.body)
  expect(body.template).toBe('plain')
  expect(body.content).toContain('case A')
  expect(lines.some(v=>v.includes('Published:'))).toBe(true)
})
test('publish requires real first-party viewer URL and refuses impersonation',async()=>{
  await expect(publishEvalReport317(report,{publishReport:true},{
    credentials:async()=>({accessToken:'oauth-test'}),
    fetchImpl:async()=>Response.json({url:'https://evil.example/artifacts/report'}),
    onStatus:()=>{}
  })).rejects.toThrow('untrusted')
})
test('publish never reports success on unauthenticated or rejected requests',async()=>{
  const unauthed=await publishEvalReport317(report,{publishReport:true},{
    credentials:async()=>{throw Error('no OAuth')},onStatus:()=>{}
  })
  expect(unauthed).toEqual({status:'local',reason:'unauthenticated'})
  await expect(publishEvalReport317(report,{publishReport:true},{
    credentials:async()=>({accessToken:'oauth-test'}),
    fetchImpl:async()=>Response.json({error:'disabled'},{status:403}),
    onStatus:()=>{}
  })).rejects.toThrow('HTTP 403')
})

test('automatic upload requires a policy verdict for the OAuth token and honors opt-out', async () => {
  const calls: string[] = []
  const deps = {
    credentials: async () => ({ accessToken: 'policy-fixture' }),
    authorize: async (token: string) => { calls.push(token); return false },
    fetchImpl: async () => { throw new Error('unexpected upload') },
    onStatus: () => {},
  }
  expect(await publishEvalReport317(report, { publish: false }, deps, true))
    .toEqual({ status: 'local', reason: 'disabled' })
  expect(calls).toEqual([])
  expect(await publishEvalReport317(report, {}, deps, true))
    .toEqual({ status: 'local', reason: 'policy' })
  expect(calls).toEqual(['policy-fixture'])
})
