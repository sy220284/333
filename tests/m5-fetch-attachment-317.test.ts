import {test,expect} from 'bun:test'
import {mkdtempSync,readdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  fetchAttachmentHere317,validateAttachmentName317,
  validateFetchAttachmentInput317,
} from '../src/bridge/fetchAttachment317.ts'

const fresh=()=>mkdtempSync(join(tmpdir(),'fetch-attachment-317-'))
function options(directory:string,overrides:Record<string,unknown>={}){
  return {
    directory,baseUrl:'https://api.anthropic.com',
    token:'private-oauth',signal:new AbortController().signal,
    firstParty:true,
    fetchImpl:async(input:RequestInfo|URL,init?:RequestInit)=>
      new Response('payload-317',{status:200,headers:{'content-length':'11'}}),
    ...overrides,
  }
}
const payload={file_uuid:'f_abc123',name:'data.txt'}
test('317 FetchAttachment name schema blocks staging names, traversal and oversized names',()=>{
  for(const value of ['', '..','.','../secret','dir/file','dir\\file',
    '.stage-tmp.file','x'.repeat(256),'\0bad']){
    expect(()=>validateAttachmentName317(value)).toThrow()
  }
  expect(validateFetchAttachmentInput317(payload)).toEqual({
    ...payload,keep_existing:undefined,
  })
  expect(()=>validateFetchAttachmentInput317({...payload,keep_existing:'yes'})).toThrow()
  expect(()=>validateFetchAttachmentInput317({...payload,file_uuid:''})).toThrow()
})
test('317 authenticated FetchAttachment writes atomically with verified path',async()=>{
  const dir=fresh()
  try{
    let requestUrl='',bearer='',redirect=''
    const result=await fetchAttachmentHere317(payload,options(dir,{
      fetchImpl:async(url:RequestInfo|URL,init?:RequestInit)=>{
        requestUrl=String(url)
        bearer=new Headers(init?.headers).get('authorization')??''
        redirect=init?.redirect??''
        return new Response('payload-317',{status:200})
      },
    }))
    expect(result.output).toEqual({outcome:'placed'})
    expect(result.localPath).toBe(join(dir,'data.txt'))
    expect(readFileSync(result.localPath!,'utf8')).toBe('payload-317')
    expect(requestUrl).toContain('/api/oauth/files/f_abc123/content')
    expect(bearer).toBe('Bearer private-oauth')
    expect(redirect).toBe('manual')
    expect(readdirSync(dir)).toEqual(['data.txt'])
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 keep_existing is never downloaded or overwritten',async()=>{
  const dir=fresh()
  try{
    writeFileSync(join(dir,'data.txt'),'existing')
    const result=await fetchAttachmentHere317({...payload,keep_existing:true},
      options(dir,{fetchImpl:async()=>{throw Error('must not fetch')}}))
    expect(result.output.outcome).toBe('kept')
    expect(readFileSync(join(dir,'data.txt'),'utf8')).toBe('existing')
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 provider, token and HTTP policy reject without writing',async()=>{
  const dir=fresh()
  try{
    expect((await fetchAttachmentHere317(payload,options(dir,{
      firstParty:false,
      fetchImpl:async()=>{throw Error('not allowed')},
    }))).output.reason).toBe('not_first_party')
    expect((await fetchAttachmentHere317(payload,options(dir,{
      token:undefined,fetchImpl:async()=>{throw Error('not allowed')},
    }))).output.reason).toBe('no_token')
    expect((await fetchAttachmentHere317(payload,options(dir,{
      fetchImpl:async()=>new Response(null,{status:302}),
    }))).output.reason).toBe('http_302')
    expect(readdirSync(dir)).toEqual([])
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 stream hard limit rejects without leaving temp files',async()=>{
  const dir=fresh()
  try{
    const outcome=await fetchAttachmentHere317(payload,options(dir,{
      maxBytes:4,
      fetchImpl:async()=>new Response('0123456789',{status:200}),
    }))
    expect(outcome.output.outcome).toBe('too_large')
    expect(readdirSync(dir)).toEqual([])
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 empty fetch does not claim success or create file',async()=>{
  const dir=fresh()
  try{
    const outcome=await fetchAttachmentHere317(payload,options(dir,{
      fetchImpl:async()=>new Response('',{status:200}),
    }))
    expect(outcome.output).toEqual({outcome:'failed',reason:'empty'})
    expect(readdirSync(dir)).toEqual([])
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 never follows a pre-existing symbolic-link target',async()=>{
  const dir=fresh()
  try{
    writeFileSync(join(dir,'target'),'secret')
    symlinkSync(join(dir,'target'),join(dir,'data.txt'))
    await expect(fetchAttachmentHere317({...payload,keep_existing:true},
      options(dir))).rejects.toThrow('not a regular file')
    expect(readFileSync(join(dir,'target'),'utf8')).toBe('secret')
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 inbound Bridge production chain uses protocol-level fetcher',()=>{
  const code=readFileSync(join(import.meta.dir,'../src/bridge/inboundAttachments.ts'),'utf8')
  expect(code).toContain('fetchAttachmentHere317(')
  expect(code).toContain('firstParty:')
  expect(code).not.toContain("axios.get(")
})

test('317 truncated HTTP body does not commit a corrupt attachment',async()=>{
  const dir=fresh()
  try{
    const result=await fetchAttachmentHere317(payload,options(dir,{
      fetchImpl:async()=>new Response('partial',{status:200,
        headers:{'content-length':'22'}}),
    }))
    expect(result.output).toEqual({outcome:'failed',reason:'truncated'})
    expect(readdirSync(dir)).toEqual([])
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('317 invalid Content-Length is rejected before creating destination file',async()=>{
  const dir=fresh()
  try{
    const result=await fetchAttachmentHere317(payload,options(dir,{
      fetchImpl:async()=>new Response('some data',{status:200,
        headers:{'content-length':'not-a-number'}}),
    }))
    expect(result.output).toEqual({outcome:'failed',reason:'length'})
    expect(readdirSync(dir)).toEqual([])
  }finally{rmSync(dir,{recursive:true,force:true})}
})
