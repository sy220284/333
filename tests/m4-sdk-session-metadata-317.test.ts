import {test, expect} from 'bun:test'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

test('SDK 317 session metadata: list, detail, rename, tag and clear persist in real JSONL',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sdk-session-files-317-'))
  const old=process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR=join(root,'.claude')
  const project=join(root,'workspace')
  const session='c0a1c0a1-1234-4234-8234-123456789abc'
  try{
    mkdirSync(project,{recursive:true})
    const portable=await import('../src/utils/sessionStoragePortable.ts')
    const sdk=await import('../src/entrypoints/agentSdkTypes.ts')
    // Actual CLI storage uses the canonical cwd from bootstrap. SDK list and
    // lookup also canonicalize incoming cwd. On macOS (/var -> /private/var)
    // and some Windows temp roots, writing under the raw alias creates a
    // fixture in a different project key than any real CLI session.
    const canonicalProject=await portable.canonicalizePath(project)
    const path=join(portable.getProjectDir(canonicalProject),session+'.jsonl')
    mkdirSync(portable.getProjectDir(canonicalProject),{recursive:true})
    const timestamp='2026-11-01T00:00:00.000Z'
    writeFileSync(path,[
      JSON.stringify({type:'user',uuid:'a0a1c0a1-1234-4234-8234-123456789abc',
        parentUuid:null,sessionId:session,timestamp,cwd:canonicalProject,message:{role:'user',content:'hello'}}),
      JSON.stringify({type:'custom-title',customTitle:'Original SDK session',sessionId:session}),
    ].join('\n')+'\n')
    const listed=await sdk.listSessions({dir:project})
    expect(listed).toHaveLength(1)
    expect(listed[0].sessionId).toBe(session)
    expect((await sdk.getSessionInfo(session,{dir:project}))?.customTitle).toBe('Original SDK session')
    await sdk.renameSession(session,'Renamed through SDK',{dir:project})
    expect((await sdk.getSessionInfo(session,{dir:project}))?.customTitle).toBe('Renamed through SDK')
    await sdk.tagSession(session,'production',{dir:project})
    expect((await sdk.getSessionInfo(session,{dir:project}))?.tag).toBe('production')
    await sdk.tagSession(session,null,{dir:project})
    expect((await sdk.getSessionInfo(session,{dir:project}))?.tag).toBeUndefined()
    const sdkMessages=await sdk.getSessionMessages(session,{dir:project})
    expect(sdkMessages).toHaveLength(1)
    expect(sdkMessages[0].type).toBe('user')
    expect((sdkMessages[0] as {message:{content:string}}).message.content).toBe('hello')
    expect(await sdk.getSessionMessages(session,{dir:project,limit:0})).toEqual([])
    expect(await sdk.getSessionMessages(session,{dir:project,offset:1})).toEqual([])
    await expect(sdk.getSessionMessages(session,{dir:project,offset:-1})).rejects.toThrow('pagination')
    const fork=await sdk.forkSession(session,{dir:project,title:'Independent Fork'})
    expect(fork.sessionId).not.toBe(session)
    expect((await sdk.getSessionInfo(fork.sessionId,{dir:project}))?.customTitle).toBe('Independent Fork')
    const forkMessages=await sdk.getSessionMessages(fork.sessionId,{dir:project})
    expect(forkMessages).toHaveLength(1)
    expect(forkMessages[0].uuid).not.toBe(sdkMessages[0].uuid)
    expect((forkMessages[0] as {message:{content:string}}).message.content).toBe('hello')
    const forkData=(await import('node:fs/promises')).readFile
    const forkJsonl=await forkData(join(portable.getProjectDir(canonicalProject),fork.sessionId+'.jsonl'),'utf8')
    expect(forkJsonl).not.toContain('file-history-snapshot')
    const firstFork=JSON.parse(forkJsonl.split('\n')[0])
    expect(firstFork.parentUuid).toBeNull()
    expect(firstFork.sessionId).toBe(fork.sessionId)
    await expect(sdk.forkSession(session,{dir:project,upToMessageId:'absent'})).rejects.toThrow('upToMessageId')
    const after=await sdk.listSessions({dir:project})
    const sourceAgain=after.find(item=>item.sessionId===session)
    const forkAgain=after.find(item=>item.sessionId===fork.sessionId)
    expect(sourceAgain?.summary).toBe('Renamed through SDK')
    expect(sourceAgain?.tag).toBeUndefined()
    expect(forkAgain?.summary).toBe('Independent Fork')
  }finally{
    if(old===undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR=old
    rmSync(root,{recursive:true,force:true})
  }
})

test('SDK 317 validates malformed and absent session mutations before touching disk',async()=>{
  const sdk=await import('../src/entrypoints/agentSdkTypes.ts')
  expect(await sdk.getSessionInfo('../../outside')).toBeUndefined()
  await expect(sdk.renameSession('../../outside','unsafe')).rejects.toThrow('Invalid session ID')
  await expect(sdk.tagSession('../outside','unsafe')).rejects.toThrow('Invalid session ID')
  await expect(sdk.renameSession('12345678-1234-4234-8234-123456789abc','')).rejects.toThrow('Title')
})
