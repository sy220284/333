import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { readdir, readFile, writeFile, rename, realpath, mkdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { createDesktopClient } from '../../src/services/desktop/client.js'

const git = promisify(execFile)
const permitted = new Set([
  'hello','models.list','sessions.open','sessions.resume','sessions.list','sessions.history',
  'sessions.close','sessions.status','sessions.send','sessions.interrupt','sessions.setModel',
  'sessions.setPermissionMode','host.list','host.respond','host.reject','permissions.list',
  'permissions.decide','agents.overview','agents.setMode','missions.list','missions.get',
  'missions.create','missions.select','missions.updateStatus','missions.checkpoint',
  'missions.jobs.list','missions.jobs.enqueue','missions.jobs.start','missions.jobs.runBatch',
  'missions.jobs.approve','missions.jobs.retry','missions.jobs.recover','missions.jobs.cancel',
  'tasks.list','tasks.stop','tasks.resume'
])
type Host = { child: ReturnType<typeof spawn>; client: ReturnType<typeof createDesktopClient> }
const hosts = new Map<string, Host>()
let active = process.env.HOME || process.env.USERPROFILE || process.cwd()
let window: BrowserWindow | null = null
let quitting = false

function executable(): { cmd:string; prefix:string[] } {
  const folder = app.isPackaged ? join(process.resourcesPath, 'bin') : resolve(app.getAppPath(),'..','dist')
  const file = join(folder, process.platform === 'win32' ? 'desktopHost.exe':'desktopHost')
  if (existsSync(file)) return {cmd:file,prefix:[]}
  if (!app.isPackaged && existsSync(resolve(app.getAppPath(),'../src/entrypoints/desktopHost.ts'))) {
    return {cmd:process.env.YAOYAO_BUN_PATH || 'bun',prefix:[resolve(app.getAppPath(),'../src/entrypoints/desktopHost.ts')]}
  }
  throw new Error('未找到桌面后台程序。请先在仓库根目录完成正式构建。')
}
function connect(dir:string):Host {
  const old=hosts.get(dir)
  if(old) return old
  const bin=executable()
  const child=spawn(bin.cmd,[...bin.prefix,'--cwd',dir],{
    cwd:dir,stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env}
  })
  if(!child.stdout||!child.stdin||!child.stderr) throw new Error('无法建立本地后台通信')
  const client=createDesktopClient(child.stdout,child.stdin)
  let stderr=''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data',(chunk:string)=>{ stderr=(stderr+chunk).slice(-20000) })
  client.onEvent(event=>{
    if(active===dir&&!window?.isDestroyed())window?.webContents.send('desktop:event',event)
  })
  child.on('exit',(code,signal)=>{
    hosts.delete(dir)
    client.close()
    if(!quitting&&active===dir&&!window?.isDestroyed())window?.webContents.send('desktop:event',{
      event:'desktop.disconnected',
      error:'本地后台已退出（'+String(signal||code)+'）'+(stderr?'：'+stderr.slice(-400):'')
    })
  })
  child.on('error',error=>{
    hosts.delete(dir)
    client.close()
    if(active===dir)window?.webContents.send('desktop:event',{event:'desktop.disconnected',error:error.message})
  })
  const host={child,client}
  hosts.set(dir,host)
  return host
}
async function safeFile(path:string):Promise<string> {
  if(!path||!isAbsolute(path))throw new Error('必须提供工作区内的绝对路径')
  const base=await realpath(active)
  const file=await realpath(path)
  const rel=relative(base,file)
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw new Error('文件超出当前工作区')
  return file
}
const workspacePref = () => join(app.getPath('userData'), 'workspace.json')
async function call(method:unknown,args:unknown):Promise<unknown>{
  if(typeof method!=='string'||!args||typeof args!=='object'||Array.isArray(args))throw new Error('无效桌面请求')
  const data=args as Record<string,unknown>
  if(method==='app.info')return {workspace:active,platform:process.platform,version:app.getVersion()}
  if(method==='workspace.pick'){
    const result=await dialog.showOpenDialog(window!,{properties:['openDirectory'],title:'选择本地工作区'})
    if(result.canceled||!result.filePaths[0])return {workspace:active,changed:false}
    const path=realpathSync(result.filePaths[0])
    active=path
    await mkdir(app.getPath('userData'),{recursive:true})
    await writeFile(workspacePref(),JSON.stringify({path}),{encoding:'utf8',mode:0o600})
    try {await connect(active).client.hello()}catch(error){return {workspace:active,changed:true,connected:false,error:String(error)}}
    return {workspace:active,changed:true,connected:true}
  }
  if(method==='workspace.list'){
    const folder=await safeFile(String(data.path||active))
    const stat=await readdir(folder,{withFileTypes:true})
    return {path:folder,entries:stat.filter(e=>!['.git','node_modules','.next','dist'].includes(e.name)).slice(0,500)
      .map(e=>({name:e.name,path:join(folder,e.name),directory:e.isDirectory()}))}
  }
  if(method==='workspace.read'){
    const path=await safeFile(String(data.path||''))
    const bytes=await readFile(path)
    if(bytes.length>2*1024*1024)throw new Error('文件过大，请通过工具逐段阅读')
    if(bytes.includes(0))throw new Error('二进制文件暂不提供文本预览')
    return {path,content:bytes.toString('utf8')}
  }
  if(method==='workspace.write'){
    const path=await safeFile(String(data.path||''))
    const content=data.content
    if(typeof content!=='string'||Buffer.byteLength(content)>2*1024*1024)throw new Error('文件内容无效或超过限制')
    const answer=await dialog.showMessageBox(window!,{type:'warning',buttons:['取消','保存修改'],defaultId:0,cancelId:0,
      title:'确认修改文件',message:'将修改 '+basename(path),detail:'保存前请确认文件修改符合当前任务要求。'})
    if(answer.response!==1) return {saved:false}
    const temporary=path+'.yaoyao-'+process.pid+'.tmp'
    const originalMode=(await stat(path)).mode & 0o777
    await writeFile(temporary,content,{flag:'wx',mode:originalMode})
    try{await rename(temporary,path)}catch(error){await rm(temporary,{force:true});throw error}
    return {saved:true,path}
  }
  if(method==='workspace.gitStatus'||method==='workspace.gitDiff'){
    const args=method==='workspace.gitStatus'?['status','--short','--branch']:['diff','--','.' ]
    const result=await git('git',args,{cwd:active,timeout:12000,maxBuffer:2*1024*1024,windowsHide:true})
    return {text:result.stdout}
  }
  if(!permitted.has(method))throw new Error('未开放的桌面操作：'+method)
  if(method==='sessions.setPermissionMode'&&data.mode==='bypassPermissions'){
    const answer=await dialog.showMessageBox(window!,{
      type:'warning',buttons:['取消','确认启用'],defaultId:0,cancelId:0,
      title:'确认授权模式',message:'此模式允许工具跳过常规审批',
      detail:'请仅在可信工作区中使用，关闭该会话后重新确认。'
    })
    if(answer.response!==1)throw new Error('用户取消授权模式修改')
  }
  return connect(active).client.invoke({method,...data} as Parameters<ReturnType<typeof createDesktopClient>['invoke']>[0])
}
function createWindow(){
  window=new BrowserWindow({
    width:1470,height:920,minWidth:980,minHeight:670,
    backgroundColor:'#0A101B',show:false,autoHideMenuBar:true,
    title:'摇摇车 · AI 智能体工作台',
    webPreferences:{
      preload:join(__dirname,'preload.cjs'),
      contextIsolation:true,sandbox:true,nodeIntegration:false,
      webSecurity:true
    }
  })
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',event=>event.preventDefault())
  window.once('ready-to-show',()=>window?.show())
  const url=process.env.YAOYAO_DESKTOP_DEV_URL
  if(!app.isPackaged && url)window.loadURL(url)
  else window.loadFile(join(__dirname,'../dist/index.html'))
}
app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
  const pref=workspacePref()
  if(existsSync(pref)){
    try {
      const settings=JSON.parse(await readFile(pref,'utf8')) as {path?:unknown}
      if(typeof settings.path==='string' && existsSync(settings.path)) active=realpathSync(settings.path)
    }catch(error){console.error('桌面工作区记录读取失败：',error)}
  }
  ipcMain.handle('desktop:call',(event,method,args)=>{
    if(event.sender!==window?.webContents) throw new Error('拒绝未知窗口调用')
    return call(method,args)
  })
  createWindow()
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})
})
app.on('before-quit',()=>{quitting=true;for(const host of hosts.values()){host.client.close();host.child.kill()}hosts.clear()})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
