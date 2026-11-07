import { readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ALLOWED = new Set([
  '--desktop', '--continue', '-c', '--resume', '-r',
  '--debug', '-d', '--debug-to-stderr', '-d2e', '--debug-file', '--verbose',
])
const RESTRICTED = [
  ['CLAUDE_CODE_RESTRICTED', 'a restricted session: CLAUDE_CODE_RESTRICTED'],
  ['CLAUDE_CODE_RESTRICT_PERSONAL_CONFIG', 'a session that restricts your own Claude Code files: CLAUDE_CODE_RESTRICT_PERSONAL_CONFIG'],
  ['CLAUDE_CODE_SAFE_MODE', 'safe mode: CLAUDE_CODE_SAFE_MODE'],
  ['CLAUDE_CODE_SIMPLE', 'bare mode: CLAUDE_CODE_SIMPLE'],
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function truthy(value) {
  return value !== undefined && value !== '' && value !== '0' && value !== 'false'
}

/**
 * Parse only the public Desktop fast-path's argument shape, before the REPL
 * initializer can register background timers or terminal input listeners.
 * The raw argv is still validated independently before any side effects.
 */
export function parseDesktopCliOptions(argv: string[]) {
  const options: { continue?: boolean; resume?: boolean | string } = {}
  let prompt
  const valueFlags = new Set([
    '--resume', '-r', '--debug-file', '--model', '--agent', '--sdk-url',
    '--settings', '--project-config-root', '--permission-mode',
  ])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      prompt = argv.slice(i + 1).join(' ')
      break
    }
    if (arg === '--continue' || arg === '-c') {
      options.continue = true
      continue
    }
    if (arg === '--resume' || arg === '-r') {
      const candidate = argv[i + 1]
      options.resume = candidate && !candidate.startsWith('-') ? argv[++i] : true
      continue
    }
    if (arg.startsWith('--resume=')) {
      options.resume = arg.slice('--resume='.length) || true
      continue
    }
    if (arg.startsWith('-')) {
      if (valueFlags.has(arg) && argv[i + 1] && !argv[i + 1].startsWith('-')) i++
      continue
    }
    prompt = prompt === undefined ? arg : `${prompt} ${arg}`
  }
  return { options, prompt }
}

/** Return a user-visible validation error, or null when Desktop launch is eligible. */
export function validateDesktopInvocation({
  argv = [], prompt, stdinIsTTY = false, stdoutIsTTY = false, env = {},
}: {argv?: string[]; prompt?: string; stdinIsTTY?: boolean; stdoutIsTTY?: boolean; env?: NodeJS.ProcessEnv} = {}) : string | null {
  if (!stdinIsTTY || !stdoutIsTTY ||
      argv.some(arg => ['--print', '-p', '--init-only', '--sdk-url'].includes(arg) || arg.startsWith('--sdk-url='))) {
    return '桌面工作台需要交互式启动；无界面脚本请使用 --print 或 SDK 协议。'
  }
  const incompatible = argv.filter(arg => arg.startsWith('-') && arg !== '--' && !ALLOWED.has(arg.split('=')[0]))
  if (incompatible.length) return '桌面模式不支持以下参数：' + incompatible.join(', ')
  for (const [flag, detail] of RESTRICTED) {
    if (truthy(env[flag])) return '无法从受限的 ' + detail + ' 启动桌面工作台。'
  }
  if (prompt && prompt.length > 16384) return '初始任务文本过长，请在桌面工作台输入。'
  return null
}

async function existsInProjects(sessionId) {
  const { getProjectsDir, sessionIdExists } = await import('../../utils/sessionStorage.js')
  if (sessionIdExists(sessionId)) return true
  const root = getProjectsDir()
  let dirs
  try { dirs = await readdir(root, { withFileTypes: true }) }
  catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    try {
      const file = await stat(join(root, dir.name, `${sessionId}.jsonl`))
      if (file.isFile() && file.size > 0) return true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return false
}

async function isRunningBackgroundSession(sessionId) {
  const { listSessions } = await import('../background/sessionStore.ts')
  const sessions = await listSessions({ all: true })
  return sessions.some(session => session.sessionId === sessionId && session.running)
}

function reportError(message) {
  process.stderr.write(`${message}\n`)
  return 1
}


type DesktopExecutable = {command:string;args:string[];cwd?:string}
function isFile(path:string):boolean {try{return statSync(path).isFile()}catch{return false}}
function findDesktopExecutable(env:NodeJS.ProcessEnv,platform:NodeJS.Platform):DesktopExecutable {
  const override=env.YAOYAO_DESKTOP_APP
  if(override){
    if(!isAbsolute(override))throw new Error('YAOYAO_DESKTOP_APP 必须为绝对路径')
    const target=override.endsWith('.app')?join(override,'Contents','MacOS','yaoyaoche'):override
    if(!isFile(target))throw new Error('未找到指定的桌面程序：'+target)
    return {command:target,args:[]}
  }
  const home=env.HOME||env.USERPROFILE||''
  const candidates=platform==='win32'
    ? [join(env.LOCALAPPDATA||'','Programs','yaoyaoche','yaoyaoche.exe'),
       join(env.LOCALAPPDATA||'','Programs','摇摇车','yaoyaoche.exe'),
       join(env.ProgramFiles||'','摇摇车','yaoyaoche.exe')]
    : platform==='darwin'
      ? ['/Applications/摇摇车.app/Contents/MacOS/yaoyaoche',
         join(home,'Applications','摇摇车.app','Contents','MacOS','yaoyaoche')]
      : ['/opt/yaoyaoche/yaoyaoche','/usr/lib/yaoyaoche/yaoyaoche',
         join(home,'.local','share','yaoyaoche','yaoyaoche')]
  const self=new Set([process.argv[1],process.execPath].filter(Boolean).map(path=>{
    try{return realpathSync(path!)}catch{return path}
  }))
  for(const path of candidates)if(isFile(path)&&!self.has(realpathSync(path)))
    return {command:path,args:[]}
  // 开发模式仅从当前源码/构建程序的位置寻找经包名验证的桌面项目。
  const here=dirname(fileURLToPath(import.meta.url))
  for(const root of [resolve(here,'../../..'),resolve(here,'..'),
     resolve(dirname(process.argv[1]||here),'..')]){
    const desktop=join(root,'desktop'),manifest=join(desktop,'package.json')
    if(!isFile(manifest))continue
    let name:string
    try{name=JSON.parse(readFileSync(manifest,'utf8')).name}catch{continue}
    if(name!=='yaoyaoche-desktop')continue
    if(!existsSync(join(desktop,'node_modules')))
      throw new Error('桌面依赖未安装，请在 desktop 目录执行 npm install')
    return platform==='win32'
      ? {command:'cmd.exe',args:['/d','/s','/c','npm run dev'],cwd:desktop}
      : {command:'npm',args:['run','dev'],cwd:desktop}
  }
  throw new Error('未找到摇摇车桌面应用，请安装桌面版或设置 YAOYAO_DESKTOP_APP。')
}

export async function launchDesktopFromCli({
  prompt='', options={}, argv=process.argv.slice(2),
  stdinIsTTY=process.stdin.isTTY===true,stdoutIsTTY=process.stdout.isTTY===true,
  env=process.env,platform=process.platform,
}: {prompt?:string;options?:{continue?:boolean;resume?:boolean|string};
    argv?:string[];stdinIsTTY?:boolean;stdoutIsTTY?:boolean;
    env?:NodeJS.ProcessEnv;platform?:NodeJS.Platform}={}):Promise<number>{
  const invalid=validateDesktopInvocation({argv,prompt,stdinIsTTY,stdoutIsTTY,env})
  if(invalid)return reportError(invalid)
  let sessionId=''
  if(options.resume!==undefined&&options.resume!==false){
    if(typeof options.resume!=='string'||!UUID.test(options.resume))
      return reportError('请在 --resume 后提供有效会话编号。')
    sessionId=options.resume
    if(!await existsInProjects(sessionId))return reportError('找不到本机会话：'+sessionId)
  }else if(options.continue){
    const {fetchLogs,getSessionIdFromLog}=await import('../../utils/sessionStorage.js')
    const [latest]=await fetchLogs(1)
    sessionId=latest?String(getSessionIdFromLog(latest)||''):''
    if(!sessionId)return reportError('当前工作区没有可以继续的会话。')
  }
  try{
    const exe=findDesktopExecutable(env,platform)
    const child=spawn(exe.command,exe.args,{
      cwd:exe.cwd||process.cwd(),detached:true,stdio:'ignore',windowsHide:true,
      env:{...env,YAOYAO_INITIAL_WORKSPACE:process.cwd(),
        YAOYAO_INITIAL_SESSION_ID:sessionId,YAOYAO_INITIAL_PROMPT:prompt},
    })
    await new Promise<void>((resolve,reject)=>{
      child.once('error',reject)
      child.once('spawn',()=>resolve())
    })
    child.unref()
    process.stdout.write('已启动摇摇车桌面工作台。\n')
    return 0
  }catch(error){return reportError('启动桌面工作台失败：'+
    (error instanceof Error?error.message:String(error)))}
}
