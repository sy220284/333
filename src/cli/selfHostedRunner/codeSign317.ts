/**
 * The 2.1.317 runner git signing helper (original chunk-tk5kxdch.js).
 * SSH -Y sign is forwarded to the session's trusted signing endpoint.
 * No local private key is read, and an invalid context never sends a request.
 */
import {readFile,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

export type CodeSignInput317={bufferFile:string;namespace?:string;keyFile?:string}
export type CodeSignEnvironment317=Record<string,string|undefined>
export function parseCodeSignArgs317(args:readonly string[]):CodeSignInput317{
  let sshSign=false,namespace:string|undefined,keyFile:string|undefined,bufferFile:string|undefined
  for(let index=0;index<args.length;index++){
    const arg=args[index]!
    if(arg==='-Y' && args[index+1]==='sign'){sshSign=true;index++;continue}
    if(arg==='-n' || arg==='-f'){
      const value=args[++index]
      if(!value || value.startsWith('-'))throw Error('code-sign: '+arg+' requires a value')
      if(arg==='-n')namespace=value;else keyFile=value
      continue
    }
    if(arg.startsWith('-')){
      if(args[index+1] && !args[index+1]!.startsWith('-'))index++
      continue
    }
    if(bufferFile===undefined)bufferFile=arg
  }
  if(!sshSign)throw Error('code-sign: only SSH-style signing (-Y sign) is supported; got: '+args.join(' '))
  if(!bufferFile)throw Error('code-sign: no file specified to sign')
  return {bufferFile:resolve(bufferFile),namespace,keyFile}
}
export function signingContext317(env:CodeSignEnvironment317){
  const session=env.CLAUDE_CODE_REMOTE_SESSION_ID ||
    env.CLAUDE_RUNNER_SESSION_ID?.replace(/^session_/,'cse_')
  if(!session || !/^[a-zA-Z0-9_-]+$/.test(session))throw Error(
    'code-sign: CLAUDE_CODE_REMOTE_SESSION_ID (child) / CLAUDE_RUNNER_SESSION_ID (lifecycle hook) is unset or malformed')
  const token=env.CLAUDE_CODE_SESSION_ACCESS_TOKEN
  if(!token)throw Error('code-sign: CLAUDE_CODE_SESSION_ACCESS_TOKEN is unset')
  const base=(env.ANTHROPIC_BASE_URL||env.SESSION_INGRESS_URL||
    env.CLAUDE_RUNNER_API_BASE_URL||'').replace(/\/+$/,'')
  if(!base)throw Error('code-sign: ANTHROPIC_BASE_URL (child) / CLAUDE_RUNNER_API_BASE_URL (lifecycle hook) is unset')
  const url=new URL(base)
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash)
    throw Error('code-sign: signing endpoint must be an HTTPS origin without credentials')
  return {session,token,url:url.origin+'/v1/code/sessions/'+encodeURIComponent(session)+'/sign-commit'}
}
export type CodeSignDeps317={
  env?:CodeSignEnvironment317
  fetchFn?:typeof fetch
  gitFormat?:()=>string
  readText?:(path:string)=>Promise<string>
  writeSignature?:(path:string,data:string)=>Promise<void>
}
function gitObjectFormat317(){
  const result=spawnSync('git',['rev-parse','--show-object-format'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000})
  return result.status===0 && result.stdout.trim()==='sha256'?'sha256':'sha1'
}
export async function signRunnerCommit317(
  input:CodeSignInput317,deps:CodeSignDeps317={}
):Promise<string>{
  const context=signingContext317(deps.env??process.env)
  const [contents,gitObjectFormat]=await Promise.all([
    deps.readText?deps.readText(input.bufferFile):readFile(input.bufferFile,'utf8'),
    Promise.resolve(deps.gitFormat?deps.gitFormat():gitObjectFormat317()),
  ])
  const response=await (deps.fetchFn??fetch)(context.url,{
    method:'POST',
    headers:{
      'content-type':'application/json','anthropic-version':'2023-06-01',
      'x-environment-runner-version':'shr-2.1.317',
      authorization:'Bearer '+context.token,
    },
    body:JSON.stringify({contents,source:{type:'git_repository'},git_object_format:gitObjectFormat}),
    signal:AbortSignal.timeout(30_000),
  })
  if(!response.ok)throw Error('code-sign: sign-commit returned HTTP '+response.status+
    ': '+(await response.text()).slice(0,200))
  const result:unknown=await response.json()
  if(!result || typeof result!=='object' ||
     !('signature' in result) || typeof result.signature!=='string' || !result.signature)
    throw Error('code-sign: response missing signature')
  const target=input.bufferFile+'.sig'
  if(deps.writeSignature)await deps.writeSignature(target,result.signature)
  else await writeFile(target,result.signature)
  return target
}
export async function selfHostedRunnerCodeSignMain317(args:readonly string[]):Promise<void>{
  await signRunnerCommit317(parseCodeSignArgs317(args))
}
