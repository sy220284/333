import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm,chmod,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  parseCodeSignArgs317,signingContext317,signRunnerCommit317
} from '../src/cli/selfHostedRunner/codeSign317.ts'
const env={
  CLAUDE_CODE_REMOTE_SESSION_ID:'cse_1234',
  CLAUDE_CODE_SESSION_ACCESS_TOKEN:'session-secret',
  ANTHROPIC_BASE_URL:'https://api.anthropic.com',
}
test('原版317 code-sign 仅支持 SSH -Y sign，缺失上下文先拒绝',()=>{
  assert.equal(parseCodeSignArgs317(['-Y','sign','-n','git','-f','key.pub','object']).namespace,'git')
  assert.throws(()=>parseCodeSignArgs317(['-Y','verify','a']),/SSH-style signing/)
  assert.throws(()=>parseCodeSignArgs317(['-Y','sign']),/no file/)
  assert.throws(()=>signingContext317({}),/SESSION_ID/)
  assert.throws(()=>signingContext317({...env,ANTHROPIC_BASE_URL:'http://bad.test'}),/HTTPS/)
})
test('签名协议使用实际 session、git object format、响应签名并写 .sig',async()=>{
  const root=await mkdtemp(join(tmpdir(),'runner-sign-'))
  try{
    const object=join(root,'git-commit')
    await writeFile(object,'tree abc\n')
    let recorded
    const target=await signRunnerCommit317({bufferFile:object},{
      env,gitFormat:()=> 'sha256',
      fetchFn:async (url,options)=>{
        recorded={url,options}
        return Response.json({signature:'SSH-SIGNED'})
      },
    })
    assert.equal(target,object+'.sig')
    assert.equal(await readFile(target,'utf8'),'SSH-SIGNED')
    assert.equal(recorded.url,'https://api.anthropic.com/v1/code/sessions/cse_1234/sign-commit')
    assert.equal(recorded.options.headers.authorization,'Bearer session-secret')
    assert.deepEqual(JSON.parse(recorded.options.body),{
      contents:'tree abc\n',source:{type:'git_repository'},git_object_format:'sha256'
    })
  }finally{await rm(root,{recursive:true,force:true})}
})
test('远程返回缺签名和HTTP错误时不写入签名文件',async()=>{
  const root=await mkdtemp(join(tmpdir(),'runner-sign-'))
  try{
    const path=join(root,'commit')
    await writeFile(path,'hello')
    await assert.rejects(signRunnerCommit317({bufferFile:path},{
      env,fetchFn:async()=>Response.json({})}),/missing signature/)
    await assert.rejects(signRunnerCommit317({bufferFile:path},{
      env,fetchFn:async()=>new Response('denied',{status:403})}),/HTTP 403/)
    await assert.rejects(readFile(path+'.sig'),/ENOENT/)
  }finally{await rm(root,{recursive:true,force:true})}
})
