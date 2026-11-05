/**
 * Verify actual provider tool-call and streaming behavior with one tiny
 * remote request. Never runs during ordinary startup: probes may incur cost.
 * Existing project/system prompts are not read or modified.
 */
import { randomUUID } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getIndependentApiKey, resolveIndependentModel } from './registry.js'
import { getChatGPTAccessToken } from '../../auth/chatgptOAuth.js'
import { makeIndependentFetch } from './transport.js'
type CapabilityReport = {
  model: string
  provider: string
  protocol: string
  timestamp: string
  latencyMs: number
  stream: boolean
  toolCalling: boolean
  toolRoundTrip: boolean
  details?: string
}
const path = join(homedir(),'.333','models','capabilities.json')
function readReports(): CapabilityReport[] {
  try {
    const data = JSON.parse(readFileSync(path,'utf8'))
    if (!Array.isArray(data)) throw new Error('Invalid capability report storage')
    return data as CapabilityReport[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
export function getSavedCapabilityReport(model: string): CapabilityReport | undefined {
  return readReports().find(item => item.model === model)
}
async function persist(report: CapabilityReport): Promise<void> {
  const directory = join(homedir(),'.333','models')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const list = readReports().filter(item => item.model !== report.model)
  list.push(report)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary,JSON.stringify(list,null,2),{encoding:'utf8',mode:0o600,flag:'wx'})
    await fs.rename(temporary,path)
    await fs.chmod(path,0o600)
  } finally { await fs.rm(temporary,{force:true}) }
}
function inspectEvents(text: string): {stream:boolean; tool:boolean; valid:boolean; details?:string} {
  const events = text.split(/\r?\n/).filter(row => row.startsWith('data: '))
    .map(row => row.slice(6).trim()).filter(row=>row && row!=='[DONE]').map(row=>JSON.parse(row))
  const start = events.find(event=>event.type==='message_start')
  const end = events.find(event=>event.type==='message_stop')
  const toolStart = events.find(event=>event.type==='content_block_start' && event.content_block?.name==='333_probe')
  if (!start || !end) return {stream:false,tool:false,valid:false,details:'Incomplete streaming protocol'}
  if (!toolStart) return {stream:true,tool:false,valid:false,details:'Model did not invoke requested tool'}
  const index=toolStart.index
  const input=events.filter(e=>e.type==='content_block_delta' && e.index===index && e.delta?.type==='input_json_delta')
    .map(e=>e.delta.partial_json).join('')
  let value: unknown
  try { value=JSON.parse(input) }
  catch { return {stream:true,tool:true,valid:false,details:'Tool input JSON was incomplete'} }
  if (typeof value!=='object'||value===null||(value as {ok?:unknown}).ok!==true) {
    return {stream:true,tool:true,valid:false,details:'Tool input did not satisfy required schema'}
  }
  return {stream:true,tool:true,valid:true}
}
export async function verifyIndependentModel(model: string): Promise<CapabilityReport> {
  const route=resolveIndependentModel(model)
  if (!route) throw new Error('Expected model ID in provider/model format')
  const bearer=route.provider==='chatgpt'? await getChatGPTAccessToken():getIndependentApiKey(route)
  const body={
    model,
    system:[{type:'text',text:'This is a short compatibility test. Invoke the 333_probe tool with ok=true.'}],
    messages:[{role:'user',content:'Use 333_probe({ok:true}) now.'}],
    max_tokens:256,
    stream:true,
    tool_choice:{type:'tool',name:'333_probe'},
    tools:[{name:'333_probe',description:'Validate tool-call protocol',input_schema:{
      type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false,
    }}],
  }
  const begin=Date.now()
  const internal=new Request('https://333-model-bridge.invalid/v1/messages',{
    method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'},
  })
  const http=makeIndependentFetch(route,bearer)
  const response=await http(internal,{signal:AbortSignal.timeout(30000)})
  if (!response.ok) {
    const error=await response.text()
    throw new Error(`Capability probe ${route.provider} HTTP ${response.status}: ${error.slice(0,350)}`)
  }
  const text=await response.text()
  if (text.length>1_000_000)throw new Error('Capability probe response exceeded limit')
  const result=inspectEvents(text)
  const report:CapabilityReport={
    model,provider:route.provider,protocol:route.protocol,timestamp:new Date().toISOString(),
    latencyMs:Date.now()-begin,stream:result.stream,
    toolCalling:result.tool,toolRoundTrip:result.valid,
    ...(result.details?{details:result.details}:{}),
  }
  await persist(report)
  return report
}
