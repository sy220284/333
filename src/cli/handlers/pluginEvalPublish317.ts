/** The plugin eval report publisher for Claude Code 2.1.317.
 * Reference: chunk-0gtw5f8b.js Ac() and chunk-yd64gt63.js Ijo().
 * Publish a private first-party artifact only with an authorized Claude.ai session.
 */
import {getOauthConfig} from '../../constants/oauth.js'
import {prepareApiRequest} from '../../utils/teleport/api.js'
import {renderPluginEvalReport317} from './pluginEvalReport317.ts'

export type PublishEvalOptions317={
  publishReport?:boolean;publish?:boolean;report?:string;outputDir?:string
}
export type PublishEvalResult317=
  |{status:'published';url:string}
  |{status:'local';reason:'disabled'|'unavailable'|'unauthenticated'|'policy'}
export type PublishEvalDeps317={
  fetchImpl?:typeof fetch
  credentials?:()=>Promise<{accessToken:string;orgUUID?:string|null}>
  isEnabled?:()=>boolean
  onStatus?:(message:string)=>void
}
function requireValidPublishedUrl317(value:unknown):string{
  if(typeof value!=='string')throw Error('artifact deploy returned no URL')
  const url=new URL(value,getOauthConfig().CLAUDE_AI_ORIGIN)
  if(url.protocol!=='https:'||url.username||url.password||
     (url.hostname!=='claude.ai'&&!url.hostname.endsWith('.claude.ai')))
    throw Error('artifact deploy returned an untrusted viewer URL')
  return url.href
}
export function shouldPublishEvalReport317(options:PublishEvalOptions317){
  if(options.publish===false&&options.publishReport)
    throw Error('--no-publish and --publish-report cannot be used together')
  return options.publish!==false && options.publishReport===true
}
export async function publishEvalReport317(
  report:Record<string,unknown>,options:PublishEvalOptions317,
  deps:PublishEvalDeps317={}
):Promise<PublishEvalResult317>{
  if(options.publish===false)return {status:'local',reason:'disabled'}
  const forced=shouldPublishEvalReport317(options)
  const status=deps.onStatus??(msg=>process.stderr.write(msg+'\n'))
  if(!forced)return {status:'local',reason:'disabled'}
  if(deps.isEnabled&&!deps.isEnabled()){
    status('Publishing unavailable: account or organization artifact policy disabled.')
    return {status:'local',reason:'policy'}
  }
  let credentials:{accessToken:string;orgUUID?:string|null}
  try{credentials=await (deps.credentials??prepareApiRequest)()}
  catch(error){
    status('Publishing unavailable: Claude.ai OAuth sign-in required ('+
      (error instanceof Error?error.message:String(error))+')')
    return {status:'local',reason:'unauthenticated'}
  }
  if(!credentials.accessToken)return {status:'local',reason:'unauthenticated'}
  const cases=Array.isArray(report.cases)?report.cases:[]
  const title='Eval report — '+(typeof report.suite==='object'&&report.suite!==null &&
    'root' in report.suite?String(report.suite.root):'plugin')
  const html=renderPluginEvalReport317(report)
  status('Publishing report to claude.ai (private to you)…')
  const url=getOauthConfig().CLAUDE_AI_ORIGIN.replace(/\/+$/,'')+
    '/api/frame/deploy/direct'
  const response=await (deps.fetchImpl??fetch)(url,{
    method:'POST',headers:{authorization:'Bearer '+credentials.accessToken,
      'content-type':'application/json','anthropic-version':'2023-06-01'},
    body:JSON.stringify({
      title,icon:'test',
      description:'claude plugin eval — '+cases.length+' '+(cases.length===1?'case':'cases'),
      template:'plain',content:html,
    }),
    signal:AbortSignal.timeout(60_000),
  })
  let data:unknown
  try{data=await response.json()}catch{throw Error('artifact deploy returned malformed JSON (HTTP '+response.status+')')}
  if(!response.ok)throw Error('Artifact publish HTTP '+response.status+': '+JSON.stringify(data).slice(0,280))
  if(data===null||typeof data!=='object')throw Error('artifact deploy returned invalid data')
  const obj=data as Record<string,unknown>
  const direct=obj.url??obj.viewer_url??(obj.data&&typeof obj.data==='object'?
    (obj.data as Record<string,unknown>).url:undefined)
  const slug=typeof obj.slug==='string'?obj.slug:
    obj.data&&typeof obj.data==='object'&&typeof (obj.data as Record<string,unknown>).slug==='string'
    ?(obj.data as Record<string,string>).slug:undefined
  const viewer=requireValidPublishedUrl317(direct??(slug?'/artifacts/'+encodeURIComponent(slug):undefined))
  status('Published: '+viewer)
  return {status:'published',url:viewer}
}
