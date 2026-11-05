/**
 * Local HTTP health endpoints for the Claude Code 2.1.317 runner.
 * Liveness and readiness are deliberately separate: /healthz is HTTP 200
 * when the listener is up; connected indicates the server lease is live.
 */
import {createServer,type Server} from 'node:http'
export type RunnerHostSnapshot317={
  runnerId:string|null;capacity:number;activeSessions:number;connected:boolean
}
export type RunnerHealthSnapshot317=RunnerHostSnapshot317&{
  status:'ok';version:'2.1.317';startedAt:string;lastError:string|null
}
export function createRunnerHealthState317(capacity:number){
  let state:RunnerHealthSnapshot317={
    status:'ok',version:'2.1.317',startedAt:new Date().toISOString(),
    runnerId:null,capacity,activeSessions:0,connected:false,lastError:null
  }
  return {
    get snapshot(){return {...state}},
    update(patch:Partial<RunnerHostSnapshot317>){state={...state,...patch}},
    failure(message:string){state={...state,lastError:message}},
  }
}
export function runnerMetrics317(state:RunnerHealthSnapshot317):string{
  const metrics:{
    [name:string]:number
  }={
    connected:state.connected?1:0,
    registered_runner:state.runnerId?1:0,
    active_sessions:state.activeSessions,
    capacity_total:state.capacity,
    available_capacity:Math.max(0,state.capacity-state.activeSessions),
  }
  return Object.entries(metrics).map(([name,value])=>
    '# TYPE claude_code_self_hosted_runner_'+name+' gauge\n'+
    'claude_code_self_hosted_runner_'+name+' '+value+'\n').join('')
}
export function createRunnerHealthServer317(
  state:{readonly snapshot:RunnerHealthSnapshot317},onStatus:(message:string)=>void,
  host='127.0.0.1'
){
  const server=createServer((req,res)=>{
    if(req.method!=='GET'){
      res.writeHead(405,{'allow':'GET'});res.end('method not allowed');return
    }
    if(req.url==='/healthz'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'})
      res.end(JSON.stringify(state.snapshot));return
    }
    if(req.url==='/metrics'){
      res.writeHead(200,{'content-type':'text/plain; version=0.0.4',
        'cache-control':'no-store'})
      res.end(runnerMetrics317(state.snapshot));return
    }
    res.writeHead(404);res.end('not found')
  })
  return {
    async listen(port:number):Promise<boolean>{
      if(port===0)return false
      if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid Runner health port')
      try{
        await new Promise<void>((resolve,reject)=>{
          const onError=(e:Error)=>{server.off('listening',onListening);reject(e)}
          const onListening=()=>{server.off('error',onError);resolve()}
          server.once('error',onError)
          server.once('listening',onListening)
          server.listen(port,host)
        })
        onStatus('[runner:health] /healthz and /metrics listening on 127.0.0.1:'+port)
        return true
      }catch(error){
        onStatus('[runner:warn] health listener unavailable on port '+port+': '+
          (error instanceof Error?error.message:String(error)))
        return false
      }
    },
    async close():Promise<void>{
      if(!server.listening)return
      server.closeAllConnections?.()
      await new Promise<void>((resolve,reject)=>
        server.close(err=>err?reject(err):resolve()))
    },
  }
}
