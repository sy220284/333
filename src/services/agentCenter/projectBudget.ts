/**
 * Locally scoped, serialized project budget reservations.
 * All desktop SDK sessions (normal chat, coordinator and Mission jobs) use the
 * same project file. A crashed or unmetered turn retains its reservation for
 * review instead of silently making potentially spent funds available again.
 * Provider limits still check completed requests; the last request may exceed
 * the reserved estimate and will be reported as overspend.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import * as lockfile from '../../utils/lockfile.js'

type Reservation = { id: string; ownerPid: number; remaining: number; uncertain: boolean; startedAt: string }
type BudgetDoc = { version: 1; limit: number | null; spent: number; leases: Reservation[] }
export type ProjectBudgetSnapshot = {
  limitUsd: number | null; spentUsd: number; reservedUsd: number;
  availableUsd: number | null; uncertainReservations: number; activeReservations: number;
  uncertain: Array<{id:string;reservedUsd:number;startedAt:string}>
}
const SCALE=1_000_000
const MAX=100_000*SCALE
function micros(value:number):number {
  if(!Number.isFinite(value)||value<0||value>100000)
    throw new Error('预算金额必须是 0 到 100000 之间的有效美元值')
  return Math.round(value*SCALE)
}
function dollars(value:number):number { return value/SCALE }
function validated(raw:unknown):BudgetDoc {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('项目预算账本格式损坏')
  const x=raw as BudgetDoc
  if(x.version!==1||!Number.isSafeInteger(x.spent)||x.spent<0||
    (x.limit!==null&&(!Number.isSafeInteger(x.limit)||x.limit<0||x.limit>MAX))||
    !Array.isArray(x.leases)||x.leases.length>500)throw new Error('项目预算账本格式损坏')
  const seen=new Set<string>()
  for(const row of x.leases){
    if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id)||
      !Number.isInteger(row.ownerPid)||row.ownerPid<=0||
      !Number.isSafeInteger(row.remaining)||row.remaining<0||
      typeof row.uncertain!=='boolean'||typeof row.startedAt!=='string')
      throw new Error('项目预算预占记录损坏')
    seen.add(row.id)
  }
  return x
}
export function getProjectBudgetFile(
  projectDir:string, root=join(homedir(),'.yaoyaoche','project-budgets'),
):string{
  return join(resolve(root),`project-budget-${createHash('sha256').update(resolve(projectDir)).digest('hex')}.json`)
}
export function createProjectBudget(
  projectDir:string, root=join(homedir(),'.yaoyaoche','project-budgets'),
) {
  const base=resolve(root)
  const file=getProjectBudgetFile(projectDir,root)
  const empty=():BudgetDoc=>({version:1,limit:null,spent:0,leases:[]})
  async function read():Promise<BudgetDoc>{
    let raw:string
    try{raw=await readFile(file,'utf8')}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return empty();throw error}
    if(Buffer.byteLength(raw)>150000)throw new Error('项目预算账本超过容量限制')
    return validated(JSON.parse(raw))
  }
  async function mutate<T>(apply:(doc:BudgetDoc)=>{document:BudgetDoc;result:T}):Promise<T>{
    await mkdir(base,{mode:0o700,recursive:true})
    try{await writeFile(file,JSON.stringify(empty()),{mode:0o600,flag:'wx'})}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
    const unlock=await lockfile.lock(file,{retries:{retries:8,minTimeout:25,maxTimeout:250}})
    try{
      const {document,result}=apply(await read())
      validated(document)
      const value=JSON.stringify(document)
      if(Buffer.byteLength(value)>150000)throw new Error('项目预算账本记录过多')
      const temp=`${file}.${randomUUID()}.tmp`
      try{await writeFile(temp,value,{flag:'wx',mode:0o600});await rename(temp,file)}
      finally{await rm(temp,{force:true})}
      return result
    }finally{await unlock()}
  }
  const reserved=(doc:BudgetDoc)=>doc.leases.reduce((sum,item)=>sum+item.remaining,0)
  const snapshot=(doc:BudgetDoc):ProjectBudgetSnapshot=>({
    limitUsd:doc.limit===null?null:dollars(doc.limit),
    spentUsd:dollars(doc.spent),reservedUsd:dollars(reserved(doc)),
    availableUsd:doc.limit===null?null:dollars(Math.max(0,doc.limit-doc.spent-reserved(doc))),
    uncertainReservations:doc.leases.filter(item=>item.uncertain).length,
    activeReservations:doc.leases.filter(item=>!item.uncertain).length,
    uncertain:doc.leases.filter(item=>item.uncertain).map(item=>({
      id:item.id,reservedUsd:dollars(item.remaining),startedAt:item.startedAt,
    })),
  })
  return {
    async get():Promise<ProjectBudgetSnapshot>{return snapshot(await read())},
    async configure(limitUsd:number|null):Promise<ProjectBudgetSnapshot>{
      const limit=limitUsd===null?null:micros(limitUsd)
      if(limit!==null&&limit<1)throw new Error('项目费用上限需要大于零')
      return mutate(doc=>{
        if(limit!==null&&limit<doc.spent+reserved(doc))
          throw new Error('新的项目预算低于已使用费用及正在执行的预占金额')
        const next={...doc,limit}
        return {document:next,result:snapshot(next)}
      })
    },
    async reserve(id:string, requestedUsd?:number):Promise<{id?:string;maxBudgetUsd?:number}>{
      if(requestedUsd!==undefined&&micros(requestedUsd)<=0)throw new Error('会话额度需要大于零')
      // Unlimited projects do not need a lease. Avoid forcing every ordinary
      // SDK session (including 32-way startup) through the shared file lock.
      if((await read()).limit===null)return requestedUsd===undefined?{}:{maxBudgetUsd:requestedUsd}
      return mutate<{id?:string;maxBudgetUsd?:number}>(doc=>{
        if(doc.limit===null)return {document:doc,result:requestedUsd===undefined?{}:{maxBudgetUsd:requestedUsd}}
        if(doc.leases.some(item=>item.id===id))throw new Error('重复的预算预占标识')
        const available=doc.limit-doc.spent-reserved(doc)
        if(available<=0)throw new Error('项目预算已用尽或被其他任务预占，请核对费用账本')
        const desired=requestedUsd===undefined
          ? Math.max(1,Math.floor(available/3))
          : micros(requestedUsd)
        if(desired>available)throw new Error(`当前项目可用预算 USD ${dollars(available).toFixed(4)}，无法预占 USD ${dollars(desired).toFixed(4)}`)
        const next={...doc,leases:[...doc.leases,{id,ownerPid:process.pid,remaining:desired,uncertain:false,startedAt:new Date().toISOString()}]}
        return {document:next,result:{id,maxBudgetUsd:dollars(desired)}}
      })
    },
    async remaining(id:string):Promise<number>{
      const record=(await read()).leases.find(row=>row.id===id)
      if(!record)throw new Error('预算预占记录已丢失或需要人工核对')
      if(record.uncertain)throw new Error('此预算记录的费用尚未核实，暂不可继续发送模型请求')
      return dollars(record.remaining)
    },
    async resolveUnknown(id:string,actualCostUsd:number):Promise<ProjectBudgetSnapshot>{
      const actual=micros(actualCostUsd)
      return mutate(doc=>{
        const record=doc.leases.find(row=>row.id===id)
        if(!record||!record.uncertain)throw new Error('待核实费用记录不存在或尚在执行')
        const next={...doc,spent:doc.spent+actual,leases:doc.leases.filter(row=>row.id!==id)}
        return {document:next,result:snapshot(next)}
      })
    },
    async charge(id:string,costUsd:number):Promise<void>{
      const cost=micros(costUsd)
      return mutate(doc=>{
        const item=doc.leases.find(row=>row.id===id)
        if(!item)throw new Error('预算额度预占记录不存在')
        const next={...doc,spent:doc.spent+cost,
          leases:doc.leases.map(row=>row.id!==id?row:{...row,remaining:Math.max(0,row.remaining-cost),uncertain:false})}
        return {document:next,result:undefined}
      })
    },
    async finish(id:string,uncertain:boolean):Promise<void>{
      return mutate(doc=>{
        const old=doc.leases.find(row=>row.id===id)
        if(!old)return {document:doc,result:undefined}
        return {document:{...doc,leases:uncertain
          ? doc.leases.map(row=>row.id===id?{...row,uncertain:true}:row)
          : doc.leases.filter(row=>row.id!==id)},result:undefined}
      })
    },
    async reconcile():Promise<ProjectBudgetSnapshot>{
      return mutate(doc=>{
        let changed=false
        const leases=doc.leases.map(row=>{
          if(row.uncertain)return row
          try{process.kill(row.ownerPid,0);return row}
          catch(error){
            if((error as NodeJS.ErrnoException).code!=='ESRCH')return row
            changed=true
            return {...row,uncertain:true}
          }
        })
        const next=changed?{...doc,leases}:doc
        return {document:next,result:snapshot(next)}
      })
    },
  }
}
