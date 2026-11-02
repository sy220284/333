import vm from 'node:vm'
import { parseWorkflowMetaLiteral } from './workflowMetaParser.mjs'
import {createHash} from 'node:crypto'
const metaPattern=/\bexport\s+const\s+meta\s*=\s*/
export function workflowMeta(script){
 const m=metaPattern.exec(script)
 if(!m)throw Error('Workflow requires export const meta = { name, description }')
 const open=m.index+m[0].length
 if(script[open]!=='{')throw Error('Workflow meta must be an object literal')
 let depth=0,quote='',escape=false,end=-1
 for(let i=open;i<script.length;i++){
  const c=script[i]
  if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue}
  if(c==="'"||c==='"'||c==='`'){quote=c;continue}
  if(c==='{')depth++
  if(c==='}'&&--depth===0){end=i+1;break}
 }
 if(end<0)throw Error('Unclosed workflow meta object')
 const value=parseWorkflowMetaLiteral(script.slice(open,end))
 if(!value||typeof value.name!=='string'||!/^[\w-]{1,80}$/.test(value.name)||
   typeof value.description!=='string'||!value.description.trim()||
   value.phases!==undefined&&(!Array.isArray(value.phases)||value.phases.some(p=>typeof p.title!=='string'||typeof p.detail!=='string')))
  throw Error('Invalid workflow meta name, description or phases')
 return {name:value.name,description:value.description,
   phases:(value.phases??[]).map(p=>({title:p.title,detail:p.detail}))}
}
export function validateWorkflowScript(script){
 if(typeof script!=='string'||!script.trim()||script.length>524288)throw Error('Workflow script must have 1-524288 characters')
 if(/[\x00-\x08\x0b-\x1f\x7f]/.test(script))throw Error('Workflow script has hidden control characters')
 if(/\b(?:Date\s*\.\s*now\s*\(|Math\s*\.\s*random\s*\(|new\s+Date\s*\()/.test(script))throw Error('Workflow must be deterministic')
 if(/\b(?:require\s*\(|eval\s*\(|Function\s*\(|import\s*\()/.test(script))throw Error('Workflow cannot import or evaluate code')
 const meta=workflowMeta(script),runnable=script.replace(metaPattern,'const meta = ')
 new vm.Script('(async()=>{\n'+runnable+'\n})()')
 return {meta,runnable,hash:createHash('sha256').update(script).digest('hex')}
}
/** @param {{script:string,args?:unknown,agent:(prompt:string,options?:Record<string,unknown>)=>Promise<unknown>,onPhase?:(phase:string)=>void,onLog?:(message:string)=>void,signal?:AbortSignal}} config */
/** @param {{script:string,args?:unknown,agent:(prompt:string,options?:Record<string,unknown>)=>Promise<unknown>,onPhase?:(name:string)=>void,onLog?:(line:string)=>void,signal?:AbortSignal}} input */
export async function executeWorkflowScript({script,args={},agent,onPhase=()=>{},onLog=()=>{},signal}){
  const {meta,runnable}=validateWorkflowScript(script)
  const check=()=>{if(signal?.aborted)throw new Error('Workflow cancelled')}
  check()

  // Host functions, host promises and host objects must never be placed in the
  // untrusted realm. Their Function constructors otherwise escape vm's
  // codeGeneration:false setting (agent.constructor.constructor(...)).
  const bridge={
    async agent(payload){
      check()
      const [prompt,options]=JSON.parse(payload)
      if(typeof prompt!=='string'||!prompt.trim())throw new Error('agent() needs prompt')
      const output=await agent(prompt,options)
      check()
      return JSON.stringify(output===undefined?null:output)
    },
    phase(title){check();onPhase(title)},
    log(value){check();onLog(value)},
  }
  const context=vm.createContext({
    __wfBridge:bridge,
    __wfArgs:JSON.stringify(args===undefined?{}:args),
  },{codeGeneration:{strings:false,wasm:false}})
  // This bootstrap is trusted source. The host bridge is captured in a
  // private closure and removed from globalThis before user script execution.
  const bootstrap=[
    '((bridge)=>{',
    '  const agent=async(prompt,options={})=>{',
    '    try { return JSON.parse(await bridge.agent(JSON.stringify([prompt,options]))) }',
    '    catch(error) { throw new Error(String(error)) }',
    '  };',
    '  const phase=(value)=>{',
    '    if(typeof value!=="string"||!value.trim())throw new Error("phase() needs a title");',
    '    try { bridge.phase(value) } catch(error) { throw new Error(String(error)) }',
    '  };',
    '  const log=(...items)=>{',
    '    try { bridge.log(items.map(String).join(" ")) } catch(error) { throw new Error(String(error)) }',
    '  };',
    '  const parallel=async(fs)=>{',
    '    if(!Array.isArray(fs)||fs.length>20||fs.some(f=>typeof f!=="function"))',
    '      throw new Error("parallel requires at most 20 callbacks");',
    '    return Promise.all(fs.map(f=>f()));',
    '  };',
    '  const pipeline=async(items,...stages)=>{',
    '    if(!Array.isArray(items)||items.length>100||stages.some(f=>typeof f!=="function"))',
    '      throw new Error("pipeline needs items and callbacks");',
    '    let values=items;',
    '    for(const stage of stages)values=await Promise.all(values.map((v,i)=>stage(v,i)));',
    '    return values;',
    '  };',
    '  return {agent,phase,log,parallel,pipeline};',
    '})(globalThis.__wfBridge)',
  ].join('\n')
  const api=vm.runInContext(bootstrap,context,{timeout:500})
  context.args=vm.runInContext('JSON.parse(globalThis.__wfArgs)',context,{timeout:500})
  delete context.__wfBridge
  delete context.__wfArgs
  Object.assign(context,api)
  check()
  const result=new vm.Script('(async()=>{\n'+runnable+'\n})()').runInContext(context,{timeout:500})
  await result
  check()
  return meta
}
