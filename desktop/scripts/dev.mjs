import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const nodeBin = resolve(root, 'node_modules', '.bin')
const suffix = process.platform === 'win32' ? '.cmd' : ''
const children = []
function launch(cmd,args,env={}) {
  const child=spawn(cmd,args,{cwd:root,stdio:'inherit',env:{...process.env,...env},shell:false})
  children.push(child)
  child.on('error',err=>{console.error(err);stop(1)})
  return child
}
function stop(code=0){for(const child of children)if(!child.killed)child.kill();process.exitCode=code}
process.on('SIGINT',()=>stop(0))
process.on('SIGTERM',()=>stop(0))
launch(resolve(nodeBin,'vite'+suffix),[])
const build=launch(process.execPath,[resolve(root,'scripts','build-electron.mjs')])
build.on('exit',code=>{
  if(code!==0){stop(code||1);return}
  launch(resolve(nodeBin,'electron'+suffix),['.'],{YAOYAO_DESKTOP_DEV_URL:'http://127.0.0.1:5173'})
})
