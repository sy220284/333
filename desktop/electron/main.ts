import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { parseMcpImportFile, type ImportedMcpServer } from './mcpImport.js'
import { formatWorkspaceGitDiff } from './workspaceGitDiff.mjs'
import { spawn, execFile } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { readdir, readFile, writeFile, rename, realpath, mkdir, rm, stat } from 'node:fs/promises'
import { readWorkspaceTextBounded } from './workspaceFileRead.js'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { createDesktopClient } from '../../src/services/desktop/client.js'
import { listProviderApiKeyAccounts, setProviderApiKey, deleteProviderApiKey, validateApiKeyProvider } from '../../src/services/auth/apiKeyVault.js'

function requireWindow(): BrowserWindow {
  if (!window || window.isDestroyed()) throw new Error('桌面窗口已经关闭，请重新打开应用')
  return window
}
const git = promisify(execFile)
const permitted = new Set([
  'hello','capabilities.list','capabilities.refresh','capabilities.skills.drafts','capabilities.skills.createDraft','capabilities.skills.publish','experience.list','experience.search','experience.propose','experience.evidence.preview','experience.approve','experience.retire','models.list','smart.execute','smart.start','smart.inspect','smart.history','budget.project.get','budget.project.set','budget.project.resolveUnknown','system.diagnostics','data.purge.preview','data.purge.apply','mcp.list','mcp.add','mcp.remove','mcp.toggle','sessions.open','sessions.resume','sessions.ensureOpen','sessions.list','sessions.history',
  'sessions.close','sessions.status','sessions.send','sessions.interrupt','sessions.setModel',
  'sessions.setPermissionMode','host.list','host.respond','host.reject','permissions.list',
  'permissions.decide','agents.overview','agents.activity','agents.members','agents.team.message','agents.team.inbox','artifacts.list','artifacts.register','artifacts.verify','artifacts.approve','supervisor.snapshot','agents.profiles.list','agents.profiles.create','agents.profiles.assign','agents.profiles.bindSession','agents.profiles.release','agents.profiles.status','handoffs.list','handoffs.create','handoffs.retry','handoffs.approve','agents.setMode','missions.list','missions.get',
  'missions.create','missions.select','missions.updateStatus','missions.checkpoint',
  'missions.jobs.list','missions.jobs.enqueue','missions.jobs.start','missions.jobs.evidence','missions.jobs.previewIntegrate','missions.jobs.integrate','missions.jobs.runBatch',
  'missions.jobs.approve','missions.jobs.retry','missions.jobs.recover','missions.jobs.cancel',
  'missions.jobs.runQueue','missions.jobs.haltQueue','missions.jobs.queueStatus',
  'tasks.list','tasks.stop','tasks.resume'
])
type Host = { child: ReturnType<typeof spawn>; client: ReturnType<typeof createDesktopClient> }
const hosts = new Map<string, Host>()
const launchWorkspace=process.env.YAOYAO_INITIAL_WORKSPACE
const hasLaunchWorkspace=Boolean(launchWorkspace&&existsSync(launchWorkspace)&&statSync(launchWorkspace).isDirectory())
let active=launchWorkspace&&hasLaunchWorkspace?realpathSync(launchWorkspace):process.env.HOME||process.env.USERPROFILE||process.cwd()
let window: BrowserWindow | null = null
let pendingMcpImport: { token: string; workspace: string; servers: ImportedMcpServer[] } | undefined
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
      error:`本地后台已退出（${String(signal||code)}）${stderr?`：${stderr.slice(-400)}`:''}`
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
  if(rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('文件超出当前工作区')
  return file
}
const workspacePref = () => join(app.getPath('userData'), 'workspace.json')
async function call(method:unknown,args:unknown):Promise<unknown>{
  if(typeof method!=='string'||!args||typeof args!=='object'||Array.isArray(args))throw new Error('无效桌面请求')
  const data=args as Record<string,unknown>
  if(method==='external.open'){
    const raw=data.url
    if(typeof raw!=='string'||raw.length>8192)throw new Error('链接无效或过长')
    let url:URL
    try{url=new URL(raw)}catch{throw new Error('链接格式无效')}
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password)
      throw new Error('仅允许打开无需内嵌凭证的 HTTPS 链接')
    const choice=await dialog.showMessageBox(requireWindow(),{
      type:'question',buttons:['取消','在浏览器中打开'],defaultId:0,cancelId:0,
      title:'确认打开 MCP 授权链接',message:url.hostname,
      detail:'此链接由 MCP 工具提供，将在系统浏览器中打开。请确认目标网站可信。'
    })
    if(choice.response!==1)return {opened:false}
    await shell.openExternal(url.href)
    return {opened:true}
  }
  if(method==='mcp.import.pick'){
    const chosen=await dialog.showOpenDialog(requireWindow(),{
      title:'导入本地 MCP 配置文件',properties:['openFile'],
      filters:[{name:'JSON 配置文件',extensions:['json']}]
    })
    if(chosen.canceled||!chosen.filePaths[0])return {cancelled:true}
    const filepath=chosen.filePaths[0]
    const details=await stat(filepath)
    if(!details.isFile()||details.size>1024*1024)throw new Error('导入文件必须是小于 1 MiB 的 JSON 文件')
    const servers=parseMcpImportFile(JSON.parse(await readFile(filepath,'utf8')))
    const listing=await connect(active).client.invoke({method:'mcp.list'} as Parameters<ReturnType<typeof createDesktopClient>['invoke']>[0])
    const registered=new Set((listing as {servers?:Array<{name:string}>}).servers?.map(item=>item.name)??[])
    const token=randomUUID()
    pendingMcpImport={token,workspace:active,servers}
    return {token,source:basename(filepath),servers:servers.map(item=>({
      sourceName:item.sourceName,name:item.name,type:item.config.type,collision:registered.has(item.name)
    }))}
  }
  if(method==='mcp.import.apply'){
    const draft=pendingMcpImport
    if(!draft||draft.token!==data.token||draft.workspace!==active)throw new Error('MCP 导入预览已失效，请重新选择文件')
    const scope=data.scope
    if(scope!=='local'&&scope!=='user'&&scope!=='project')throw new Error('无效的 MCP 配置范围')
    if(!Array.isArray(data.names)||data.names.some(name=>typeof name!=='string'))throw new Error('请选择要导入的 MCP 服务')
    const selected=new Set(data.names as string[])
    if(selected.size!==data.names.length||selected.size===0||draft.servers.some(item=>selected.has(item.sourceName)&&!item.name))
      throw new Error('导入选择无效')
    const importRows=draft.servers.filter(item=>selected.has(item.sourceName))
    if(importRows.length!==selected.size)throw new Error('包含配置文件中不存在的服务')
    const approval=await dialog.showMessageBox(requireWindow(),{
      type:'warning',title:'确认批量导入 MCP 服务',
      buttons:['取消','确认导入'],defaultId:0,cancelId:0,
      message:`将导入 ${importRows.length} 个本地 MCP 服务`,
      detail:'导入的命令、服务器地址和环境变量将存入所选配置范围。请仅导入可信来源。'
    })
    if(approval.response!==1)return {cancelled:true,added:[],errors:[]}
    pendingMcpImport=undefined
    const listing=await connect(active).client.invoke({method:'mcp.list'} as Parameters<ReturnType<typeof createDesktopClient>['invoke']>[0])
    const used=new Set((listing as {servers?:Array<{name:string}>}).servers?.map(item=>item.name)??[])
    const added:string[]=[]
    const errors:string[]=[]
    for(const item of importRows){
      let name=item.name
      let index=2
      while(used.has(name))name=`${item.name.slice(0,73)}_${index++}`
      try{
        await connect(active).client.invoke({method:'mcp.add',name,scope,config:item.config} as Parameters<ReturnType<typeof createDesktopClient>['invoke']>[0])
        used.add(name)
        added.push(name)
      }catch(error){
        errors.push(`${item.sourceName}：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return {added,errors}
  }
  if(method==='app.info')return {workspace:active,platform:process.platform,version:app.getVersion(),startupSessionId:process.env.YAOYAO_INITIAL_SESSION_ID||'',initialPrompt:process.env.YAOYAO_INITIAL_PROMPT||'',initialView:process.env.YAOYAO_INITIAL_VIEW||''}
  if(method==='credentials.list')return {providers:listProviderApiKeyAccounts()}
  if(method==='credentials.set'){
    const provider=validateApiKeyProvider(String(data.provider||''))
    const key=data.key
    if(typeof key!=='string')throw new Error('API Key 必须为字符串')
    const answer=await dialog.showMessageBox(requireWindow(),{type:'question',title:'保存服务商凭证',buttons:['取消','保存'],defaultId:0,cancelId:0,message:`确认保存 ${provider} 的 API Key？`,detail:'密钥写入本地受保护凭证目录，后续会话将使用此密钥。'})
    if(answer.response!==1)return {saved:false}
    await setProviderApiKey(provider,key)
    return {saved:true}
  }
  if(method==='credentials.remove'){
    const provider=validateApiKeyProvider(String(data.provider||''))
    const answer=await dialog.showMessageBox(requireWindow(),{type:'warning',title:'删除服务商凭证',buttons:['取消','确认删除'],defaultId:0,cancelId:0,message:`移除 ${provider} 的已保存 API Key？`})
    if(answer.response!==1)return {removed:false}
    await deleteProviderApiKey(provider)
    return {removed:true}
  }
  if(method==='workspace.pick'){
    const result=await dialog.showOpenDialog(requireWindow(),{properties:['openDirectory'],title:'选择本地工作区'})
    if(result.canceled||!result.filePaths[0])return {workspace:active,changed:false}
    const path=realpathSync(result.filePaths[0])
    active=path
    pendingMcpImport=undefined
    await mkdir(app.getPath('userData'),{recursive:true})
    await writeFile(workspacePref(),JSON.stringify({path}),{encoding:'utf8',mode:0o600})
    try {await connect(active).client.hello()}catch(error){return {workspace:active,changed:true,connected:false,error:String(error)}}
    return {workspace:active,changed:true,connected:true}
  }
  if(method==='workspace.list'){
    const folder=await safeFile(String(data.path||active))
    const offset=data.offset===undefined?0:Number(data.offset)
    const limit=data.limit===undefined?200:Number(data.limit)
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500)
      throw new Error('文件列表分页参数无效')
    const stat=await readdir(folder,{withFileTypes:true})
    const entries=stat.filter(e=>!['.git','node_modules','.next','dist'].includes(e.name))
      .sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name,'zh-CN'))
    return {path:folder,total:entries.length,offset,hasMore:offset+limit<entries.length,
      entries:entries.slice(offset,offset+limit).map(e=>({name:e.name,path:join(folder,e.name),directory:e.isDirectory()}))}
  }
  if(method==='workspace.read'){
    const path=await safeFile(String(data.path||''))
    return {path,content:await readWorkspaceTextBounded(path)}
  }
  if(method==='workspace.write'){
    const targetWorkspace=active
    const path=await safeFile(String(data.path||''))
    if(active!==targetWorkspace)throw new Error('工作区已切换，请在当前项目中重新确认保存')
    const content=data.content
    if(typeof content!=='string'||Buffer.byteLength(content)>2*1024*1024)throw new Error('文件内容无效或超过限制')
    const answer=await dialog.showMessageBox(requireWindow(),{type:'warning',buttons:['取消','保存修改'],defaultId:0,cancelId:0,
      title:'确认修改文件',message:`将修改 ${basename(path)}`,detail:'保存前请确认文件修改符合当前任务要求。'})
    if(answer.response!==1) return {saved:false}
    if(active!==targetWorkspace)throw new Error('工作区已切换，请在当前项目中重新确认保存')
    const temporary=`${path}.yaoyao-${process.pid}.tmp`
    const originalMode=(await stat(path)).mode & 0o777
    await writeFile(temporary,content,{flag:'wx',mode:originalMode})
    try{
      if(active!==targetWorkspace)throw new Error('工作区已切换，请在当前项目中重新确认保存')
      await rename(temporary,path)
    }catch(error){await rm(temporary,{force:true});throw error}
    return {saved:true,path}
  }
  if(method==='workspace.gitStatus'||method==='workspace.gitDiff'){
    const options={cwd:active,timeout:12000,maxBuffer:2*1024*1024,windowsHide:true}
    if(method==='workspace.gitStatus'){
      const result=await git('git',['status','--short','--branch'],options)
      return {text:result.stdout}
    }
    const [unstaged,staged,untracked]=await Promise.all([
      git('git',['diff','--no-ext-diff','--no-color','--','.'],options),
      git('git',['diff','--cached','--no-ext-diff','--no-color','--','.'],options),
      git('git',['ls-files','--others','--exclude-standard','-z','--','.'],options),
    ])
    return {text:formatWorkspaceGitDiff(unstaged.stdout,staged.stdout,untracked.stdout)}
  }
  if(method==='mcp.add'||method==='mcp.remove'||method==='mcp.toggle'){
    const name=String(data.name||'')
    const details=method==='mcp.add'?JSON.stringify(data.config):method==='mcp.toggle'?`启用：${String(data.enabled)}`:'删除现有服务配置'
    const answer=await dialog.showMessageBox(requireWindow(),{
      type:'warning',title:'确认 MCP 服务器配置',
      buttons:['取消','确认修改'],defaultId:0,cancelId:0,
      message:`确认修改 MCP 服务：${name}`,
      detail:`${details}\n所有 MCP 配置均遵守当前本地权限设置。`
    })
    if(answer.response!==1)return {cancelled:true}
  }
  if(method==='data.purge.apply'){
    if(typeof data.token!=='string')throw new Error('无效清理确认凭据')
    const confirmation=await dialog.showMessageBox(requireWindow(),{
      type:'warning',title:'确认清理本地项目记录',
      buttons:['取消','确认永久清理'],defaultId:0,cancelId:0,
      message:'将永久清理本地工作区记录',
      detail:`工作区：${active}。项目源码文件保留，相关 AI 会话、任务和历史可能被删除。此操作无法撤销。`
    })
    if(confirmation.response!==1)return {cancelled:true}
  }
  if(!permitted.has(method))throw new Error(`未开放的桌面操作：${method}`)
  if(method==='sessions.setPermissionMode'&&data.mode==='bypassPermissions'){
    const answer=await dialog.showMessageBox(requireWindow(),{
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
    width:1470,height:920,minWidth:860,minHeight:640,
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
  if(!hasLaunchWorkspace&&existsSync(pref)){
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
