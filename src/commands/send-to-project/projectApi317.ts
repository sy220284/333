/**
 * Claude Code 2.1.317 /send-to-project channel transport.
 * Ported from official chunk-xz3q4kyh.js (channel, memory, message and
 * setup-proposal requests). User approval belongs to the command/UI layer.
 */
import { randomUUID } from 'node:crypto'

export type Project317 = {
  id: string
  name: string
  visibility: 'private' | 'public' | undefined
  closed: boolean
  coordinatorSessionId: string | null
}
export type SendResult317 = {
  messageId: string
  threadRootId: string
  deduplicated: boolean
}
export type SetupResult317 =
  | {kind:'submitted'; alreadySubmitted:boolean; dropped:string[]}
  | {kind:'unavailable'; status:number; reason:string; mayHaveStored:boolean}
export type ProjectClientConfig317 = {
  baseUrl:string
  accessToken:string
  organizationUuid:string
  fetchImpl?: typeof fetch
}
export class ProjectApiError317 extends Error {
  constructor(message:string,public readonly status:number|null,
    public readonly mayHaveLanded:boolean=false){
    super(message)
    this.name='ProjectApiError317'
  }
}
const PROJECT_ID=/^chan_[A-Za-z0-9_-]{1,120}$/
const MESSAGE_ID=/^cmsg_[A-Za-z0-9_-]{1,160}$/
const SESSION_ID=/^[a-z]{2,12}_[A-Za-z0-9_-]{1,120}$/
function record(v:unknown): v is Record<string,unknown>{
  return typeof v==='object' && v!==null && !Array.isArray(v)
}
function text(v:unknown):string|null{
  return typeof v==='string' && v.trim()?v:null
}
function projectId(id:string):string{
  if(!PROJECT_ID.test(id))throw new ProjectApiError317('Invalid Claude Project ID',null)
  return id
}
function parseProject(v:unknown):Project317|null{
  const a=record(v)&&record(v.channel)?v.channel:v
  if(!record(a)||typeof a.id!=='string'||!PROJECT_ID.test(a.id) || typeof a.name!=='string')return null
  const visibility=a.visibility==='private'||a.visibility==='public'?a.visibility:undefined
  const channelSessionId=text(a.channel_session_id)
  const overviewSessionId=text(a.overview_session_id)
  return {
    id:a.id,name:a.name,visibility,
    closed:a.archived_at!=null||a.disabled_at!=null,
    coordinatorSessionId:SESSION_ID.test(channelSessionId??'')?channelSessionId:
      SESSION_ID.test(overviewSessionId??'')?overviewSessionId:null,
  }
}
export function verifyPersonalProject317(raw:unknown):Project317{
  const c=record(raw)&&record(raw.channel)?raw.channel:raw
  const p=parseProject(raw)
  if(!p)throw new ProjectApiError317('The project response is malformed',null)
  if(p.closed)throw new ProjectApiError317('The project is archived or disabled',null)
  if(p.visibility!=='private')
    throw new ProjectApiError317('Only private, personally owned Claude Projects are supported',null)
  const r=record(c)?c:{}
  const membership=record(r.membership)?r.membership:{}
  const relations=Array.isArray(r.caller_relations)?r.caller_relations:[]
  if(membership.role!=='owner'&&!relations.some(x=>String(x).toLowerCase()==='owner')){
    throw new ProjectApiError317('Your Claude account does not own this project',null)
  }
  return p
}
function extractError(v:unknown,status:number):string{
  if(record(v)&&record(v.error)){
    const message=text(v.error.message)
    if(message)return message.slice(0,240)
  }
  return 'Claude Projects request failed (HTTP '+status+')'
}
function secureBaseUrl(raw:string):string{
  const u=new URL(raw)
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)
    throw new Error('Claude Projects API origin must be an HTTPS URL')
  return u.origin
}
export function createProjectsClient317(config:ProjectClientConfig317){
  const base=secureBaseUrl(config.baseUrl)
  const execute=config.fetchImpl??fetch
  if(!config.accessToken||!config.organizationUuid)
    throw new ProjectApiError317('Claude.ai OAuth login and organization are required',null)
  async function request(method:'GET'|'POST'|'PATCH',path:string,body:unknown,signal?:AbortSignal,
    accept='application/json'):Promise<{status:number,data:unknown}>{
    const ctrl=AbortSignal.timeout(15000)
    const combined=signal?AbortSignal.any([signal,ctrl]):ctrl
    let response:Response
    try{
      response=await execute(base+path,{
        method,signal:combined,redirect:'manual',credentials:'omit',
        headers:{
          'Authorization':'Bearer '+config.accessToken,
          'Content-Type':'application/json',
          'anthropic-version':'2023-06-01',
          'x-organization-uuid':config.organizationUuid,
          'Accept':accept,
        },
        ...(method==='GET'?{}:{body:JSON.stringify(body)}),
      })
    }catch(error){
      if(signal?.aborted)throw error
      throw new ProjectApiError317('Claude Projects connection failed: '+
        (error instanceof Error?error.message:String(error)),null,method!=='GET')
    }
    const raw=await response.text()
    let data:unknown
    try{data=raw?JSON.parse(raw):null}
    catch{data=raw}
    if(response.status<200||response.status>=300){
      throw new ProjectApiError317(extractError(data,response.status),response.status,
        method!=='GET'&&(response.status>=500||response.status===408))
    }
    return {status:response.status,data}
  }
  return {
    async list(signal?:AbortSignal):Promise<Project317[]>{
      let cursor:string|null=null
      const all:Project317[]=[]
      const seen=new Set<string>()
      for(let page=0;page<10;page++){
        const query=new URLSearchParams({scope:'joined',limit:'50'})
        if(cursor)query.set('cursor',cursor)
        const {data}=await request('GET','/v1/code/channels?'+query.toString(),undefined,signal)
        if(!record(data)||!Array.isArray(data.data))
          throw new ProjectApiError317('Claude Projects list response is malformed',null)
        for(const item of data.data){
          const p=parseProject(item)
          if(p && !seen.has(p.id)){seen.add(p.id);all.push(p)}
        }
        const next=text(data.next_cursor)
        if(!next)return all
        if(next===cursor)throw new ProjectApiError317('Projects pagination cursor repeated',null)
        cursor=next
      }
      throw new ProjectApiError317('Projects list exceeded the maximum page limit',null)
    },
    async getOwned(id:string,signal?:AbortSignal):Promise<Project317>{
      const {data}=await request('GET','/v1/code/channels/'+encodeURIComponent(projectId(id)),
        undefined,signal)
      return verifyPersonalProject317(data)
    },
    async create(name:string,signal?:AbortSignal):Promise<Project317>{
      const cleaned=name.trim()
      if(!cleaned||cleaned.length>200||Buffer.byteLength(cleaned)>200)
        throw new ProjectApiError317('Project name must be 1–200 UTF-8 bytes',null)
      const {data}=await request('POST','/v1/code/channels',
        {visibility:'private',name:cleaned,icon:'Code'},signal)
      const p=parseProject(data)
      if(!p)throw new ProjectApiError317(
        'Project creation returned no valid project ID; check Projects before retrying',null,true)
      return p
    },
    async send(id:string,body:string,clientMessageId:string,signal?:AbortSignal):Promise<SendResult317>{
      if(typeof body!=='string'||!body.trim()||Buffer.byteLength(body)>1024)
        throw new ProjectApiError317('Message must be non-empty and at most 1024 UTF-8 bytes',null)
      if(!/^[a-zA-Z0-9_-]{8,128}$/.test(clientMessageId))
        throw new ProjectApiError317('Invalid message deduplication key',null)
      const {data}=await request('POST','/v1/code/channels/'+encodeURIComponent(projectId(id))+
        '/messages',{body,client_message_id:clientMessageId},signal)
      const messageId=record(data)?text(data.message_id):null
      const threadRootId=record(data)?text(data.thread_root_id):null
      if(!messageId||!MESSAGE_ID.test(messageId)||
         !threadRootId||!MESSAGE_ID.test(threadRootId)){
        throw new ProjectApiError317(
          'Message may have arrived, but server response is incomplete; check the project before retrying',
          null,true)
      }
      return {messageId,threadRootId,
        deduplicated:record(data)&&data.deduplicated===true}
    },
    async memory(id:string,path:string,content:string,signal?:AbortSignal):Promise<'created'|'existing'>{
      if(!/^\/[a-zA-Z0-9._/-]{1,140}$/.test(path)||path.includes('..'))
        throw new ProjectApiError317('Invalid project memory path',null)
      const p='/v1/code/memory/channel/'+encodeURIComponent(projectId(id))+'/memories'
      try{
        await request('POST',p,{path,content,precondition:{type:'not_exists'}},signal)
        return 'created'
      }catch(error){
        if(error instanceof ProjectApiError317 && error.status===409)return 'existing'
        throw error
      }
    },
    async submitSetup(id:string,proposal:Record<string,unknown>,sourceSessionId:string|null,
      clientRequestId=randomUUID(),signal?:AbortSignal):Promise<SetupResult317>{
      if(!/^[A-Za-z0-9_-]{8,128}$/.test(clientRequestId))
        throw new ProjectApiError317('Invalid setup request ID',null)
      const url='/v1/code/channels/'+encodeURIComponent(projectId(id))+'/setup-proposals'
      try{
        const {data}=await request('POST',url,{
          proposal,client_request_id:clientRequestId,
          ...(sourceSessionId?{source_session_id:sourceSessionId}:{}),
        },signal)
        const setupId=record(data)&&record(data.message)?text(data.message.id):null
        if(!setupId||!MESSAGE_ID.test(setupId)){
          throw new ProjectApiError317('Setup reply is incomplete; check the project before retrying',null,true)
        }
        return {kind:'submitted',alreadySubmitted:data.already_submitted===true,
          dropped:Array.isArray(data.dropped)?data.dropped.filter(x=>typeof x==='string'):[]}
      }catch(error){
        if(error instanceof ProjectApiError317 && error.status!==null &&
          !error.mayHaveLanded && error.status!==401 && error.status!==403){
          return {kind:'unavailable',status:error.status,
            reason:error.message,mayHaveStored:false}
        }
        throw error
      }
    },
    async handoff(sessionId:string,message:string,signal?:AbortSignal):Promise<void>{
      if(!SESSION_ID.test(sessionId))
        throw new ProjectApiError317('Invalid project coordinator session ID',null)
      const {data}=await request('POST','/v1/code/mcp/meta',{
        jsonrpc:'2.0',id:1,method:'tools/call',
        params:{name:'send_message',arguments:{session_id:sessionId,message,priority:'now'}},
      },signal,'application/json, text/event-stream')
      let response:unknown=data
      if(typeof data==='string'){
        const pieces=data.split(/\r?\n\r?\n/).flatMap(block=>block.split(/\r?\n/)
          .filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()))
        response=pieces.map(s=>{try{return JSON.parse(s)}catch{return null}})
          .find(o=>record(o)&&o.id===1)||null
      }
      const recordResponse=Array.isArray(response)?
        response.find(o=>record(o)&&o.id===1):response
      if(!record(recordResponse)||recordResponse.id!==1||
        recordResponse.error||!recordResponse.result)
        throw new ProjectApiError317('Project coordinator did not confirm the handoff',null,true)
    },
    createMessageId:()=>randomUUID().replaceAll('-',''),
  }
}
