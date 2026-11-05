/**
 * 2.1.317 FetchAttachment wire operation.
 *
 * The official RPC takes {file_uuid,name,keep_existing?}; PlaceFiles is a
 * distinct RPC with size/sha256/offset fields (chunk-h404ga6t.js).
 * The download below mirrors chunk-hy0q7sz1.js and never exposes OAuth
 * credentials, follows redirects, or writes through a caller-controlled link.
 */
import {randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {lstat,mkdir,open,realpath,rename,rm,link,statfs} from 'node:fs/promises'
import {isAbsolute,join,resolve,parse,relative} from 'node:path'

const MAX_FILE_BYTES=500*1024*1024
const MAX_NAME_BYTES=255
const TEMP_PREFIX='.stage-tmp.'
export type FetchAttachmentInput317={
  file_uuid:string
  name:string
  keep_existing?:boolean
}
export type FetchAttachmentOutput317={
  outcome:'placed'|'kept'|'too_large'|'failed'
  reason?:string
}
export type FetchAttachmentResult317={
  summary:string
  output:FetchAttachmentOutput317
  localPath?:string
}
export type FetchAttachmentOptions317={
  directory:string
  baseUrl:string
  token:string|undefined
  signal:AbortSignal
  firstParty:boolean
  fetchImpl?:typeof fetch
  maxBytes?:number
}
export function validateAttachmentName317(name:unknown):string{
  if(typeof name!=='string'||name.length===0||
     Buffer.byteLength(name,'utf8')>MAX_NAME_BYTES||
     name==='.'||name==='..'||name.startsWith(TEMP_PREFIX)||
     /[/\\\0]/.test(name))
    throw new Error('name must be a file name of at most 255 bytes, with no directory, that is not a staging name')
  return name
}
export function validateFetchAttachmentInput317(input:unknown):FetchAttachmentInput317{
  if(typeof input!=='object'||input===null||Array.isArray(input))
    throw new TypeError('FetchAttachment requires an object')
  const i=input as Record<string,unknown>
  if(typeof i.file_uuid!=='string'||i.file_uuid.length===0||i.file_uuid.length>256)
    throw new TypeError('FetchAttachment file_uuid must be 1–256 characters')
  const name=validateAttachmentName317(i.name)
  if(i.keep_existing!==undefined&&typeof i.keep_existing!=='boolean')
    throw new TypeError('FetchAttachment keep_existing must be a boolean')
  return {file_uuid:i.file_uuid,name,keep_existing:i.keep_existing as boolean|undefined}
}
function result(outcome:FetchAttachmentOutput317['outcome'],summary:string,
  reason?:string,localPath?:string):FetchAttachmentResult317{
  return {summary,output:{outcome,...(reason?{reason}:{})},
    ...(localPath?{localPath}:{})}
}
async function checkDirectory(path:string):Promise<string>{
  if(!isAbsolute(path)||/^[/\\]{2}/.test(path))
    throw new Error('FetchAttachment requires an absolute local directory')
  const target=resolve(path)
  const root=parse(target).root
  let cursor=root
  for(const part of relative(root,target).split(/[\\/]+/).filter(Boolean)){
    cursor=join(cursor,part)
    let mode
    try{mode=await lstat(cursor)}
    catch(error){
      if((error as NodeJS.ErrnoException).code==='ENOENT'){
        await mkdir(cursor,{mode:0o700})
        mode=await lstat(cursor)
      }else throw error
    }
    if(mode.isSymbolicLink()){
      const linked=await realpath(cursor)
      if(/^[/\\]{2}/.test(linked))
        throw new Error('FetchAttachment directory link leads to a network share')
      cursor=linked
      mode=await lstat(cursor)
    }
    if(!mode.isDirectory())
      throw new Error('FetchAttachment directory contains a non-directory')
  }
  const canonical=await realpath(target)
  if(/^[/\\]{2}/.test(canonical))
    throw new Error('FetchAttachment directory is on a network share')
  // NFS/CIFS/SMB are not safe destinations for an on-host atomic handoff.
  const fsInfo=await statfs(canonical)
  if(new Set([0x6969,0x517b,0xff534d42]).has(Number(fsInfo.type)))
    throw new Error('FetchAttachment requires a local filesystem')
  return canonical
}
export async function fetchAttachmentHere317(raw:unknown,
  options:FetchAttachmentOptions317):Promise<FetchAttachmentResult317>{
  const input=validateFetchAttachmentInput317(raw)
  if(!options.firstParty)
    return result('failed','not downloaded: not permitted on this API provider','not_first_party')
  if(!options.token)
    return result('failed','not downloaded: Claude.ai login required','no_token')
  if(options.signal.aborted)throw options.signal.reason
  const maxBytes=options.maxBytes??MAX_FILE_BYTES
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_FILE_BYTES)
    throw new RangeError('Invalid FetchAttachment byte limit')
  const dir=await checkDirectory(options.directory)
  const path=join(dir,input.name)
  if(input.keep_existing){
    try{
      const current=await lstat(path)
      if(current.isFile()&&!current.isSymbolicLink())
        return result('kept','left the file that was there',undefined,path)
      throw new Error('FetchAttachment destination is not a regular file')
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error
    }
  }
  const base=new URL(options.baseUrl)
  if(base.protocol!=='https:'||base.username||base.password)
    throw new Error('FetchAttachment source must be an HTTPS API origin')
  const target=new URL('/api/oauth/files/'+encodeURIComponent(input.file_uuid)+'/content',
    base.origin)
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(30_000)])
  const downloader=options.fetchImpl??fetch
  let response:Response
  try{
    response=await downloader(target,{
      method:'GET',signal,redirect:'manual',credentials:'omit',
      headers:{Authorization:'Bearer '+options.token},
    })
  }catch(error){
    if(options.signal.aborted)throw error
    return result('failed','not downloaded: network request failed','network')
  }
  if(response.status!==200)
    return result('failed','not downloaded: server returned '+response.status,
      'http_'+response.status)
  const declaredLength=response.headers.has('content-length')?
    Number(response.headers.get('content-length')):null
  if(declaredLength!==null && (!Number.isSafeInteger(declaredLength)||declaredLength<0))
    return result('failed','not downloaded: invalid byte count','length')
  if(declaredLength!==null && declaredLength>maxBytes)
    return result('too_large','not downloaded: over 500 MiB')
  if(!response.body)
    return result('failed','not downloaded: empty response body','empty')
  const staged=join(dir,TEMP_PREFIX+randomUUID())
  const flags=constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|
    (constants.O_NOFOLLOW||0)
  let total=0
  let committed=false
  const file=await open(staged,flags,0o600)
  const initial=await file.stat()
  try{
    const reader=response.body.getReader()
    try{
      for(;;){
        signal.throwIfAborted()
        const next=await reader.read()
        if(next.done)break
        total+=next.value.byteLength
        if(total>maxBytes)
          return result('too_large','not downloaded: over 500 MiB')
        await file.writeFile(next.value)
      }
    }finally{reader.releaseLock()}
    if(total===0)return result('failed','not placed: the file is empty','empty')
    if(declaredLength!==null && total!==declaredLength)
      return result('failed','not placed: incomplete download','truncated')
    await file.sync()
    await file.close()
    const after=await lstat(staged)
    if(!after.isFile()||after.dev!==initial.dev||after.ino!==initial.ino)
      return result('failed','not placed: staged file was replaced','replaced')
    options.signal.throwIfAborted()
    const realDir=await realpath(dir)
    if(realDir!==dir)
      throw new Error('FetchAttachment destination changed during download')
    if(input.keep_existing){
      try{
        await link(staged,path)
      }catch(error){
        if((error as NodeJS.ErrnoException).code==='EEXIST')
          return result('kept','left the file that was there',undefined,path)
        throw error
      }
    }else{
      await rename(staged,path)
    }
    committed=true
    return result('placed','placed '+total+' bytes',undefined,path)
  }finally{
    await file.close()
    if(!committed)await rm(staged,{force:true})
    else if(input.keep_existing)await rm(staged,{force:true})
  }
}
