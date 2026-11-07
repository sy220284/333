import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const children=[]
function launch(script,args=[],env={}){
  const child=spawn(process.execPath,[script,...args],{
    cwd:root,stdio:'inherit',env:{...process.env,...env},windowsHide:true
  })
  children.push(child)
  child.on('error',error=>{console.error(error);stop(1)})
  return child
}
function stop(code=0){
  for(const child of children)if(!child.killed)child.kill()
  process.exitCode=code
}
process.on('SIGINT',()=>stop(0))
process.on('SIGTERM',()=>stop(0))
launch(resolve(root,'node_modules','vite','bin','vite.js'))
const build=launch(resolve(root,'scripts','build-electron.mjs'))
build.on('exit',async code=>{
  if(code!==0){stop(code||1);return}
  const url='http://127.0.0.1:5173'
  let ready=false
  for(let attempt=0;attempt<50;attempt++){
    try{const response=await fetch(url);if(response.ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  if(!ready){console.error('Vite 页面服务未启动');stop(1);return}
  launch(resolve(root,'node_modules','electron','cli.js'),['.'],{YAOYAO_DESKTOP_DEV_URL:url})
})
