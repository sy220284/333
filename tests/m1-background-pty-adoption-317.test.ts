import {test,expect} from 'bun:test'
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnBackgroundPty317,reconnectBackgroundPty317} from '../src/cli/background/ptyWorker317.ts'

test('317 independent PTY survives supervisor detach and authenticates a successor',async()=>{
  if(process.platform==='win32')return
  const dir=await mkdtemp(join(tmpdir(),'pty-adopt-317-'))
  const config=join(dir,'config'),script=join(dir,'worker.mjs')
  const source=fileURLToPath(new URL('../src/bootstrap/ptyHost317.ts',import.meta.url))
  await mkdir(config,{recursive:true})
  await writeFile(script,`import {runPtyHost317} from ${JSON.stringify(source)};
if(process.argv[2]==='--bg-pty-host'){
  process.exitCode=await runPtyHost317(process.argv.slice(3));
}else{
  process.stdout.write('independent-worker-running\\n');
  setInterval(()=>{},1000);
}
`)
  const env={...process.env,HOME:dir,CLAUDE_CONFIG_DIR:config}
  let oldExits=0,newExits=0
  const options={
    id:'a1b2c3d4',cwd:dir,cols:80,rows:30,env,
    executable:process.execPath,prefix:[script],args:[],
    onReplay:async(_data:Buffer)=>{},onOutput:(_data:Buffer)=>{},
    onExit:()=>{oldExits++},onStatus:(_message:string)=>{},
  }
  let launched
  try{
    launched=await spawnBackgroundPty317(options)
    expect(launched.proc.pid).toBeGreaterThan(1)
    const hostPid=launched.proc.pid
    launched.proc.detach()
    const adopted=await reconnectBackgroundPty317({
      ...options,onExit:()=>{newExits++},
    },hostPid,launched.socket)
    expect(adopted.pid).toBe(hostPid)
    adopted.kill('SIGTERM')
    const exit=await Promise.race([
      adopted.exited,
      Bun.sleep(12_000).then(()=>{throw new Error('PTY host did not exit')}),
    ])
    expect(Number.isInteger(exit)).toBe(true)
    await Bun.sleep(30)
    expect(oldExits).toBe(0)
    expect(newExits).toBe(1)
  }finally{
    if(launched){
      try{process.kill(launched.proc.pid,'SIGTERM')}catch{}
    }
    await rm(dir,{recursive:true,force:true})
  }
})
