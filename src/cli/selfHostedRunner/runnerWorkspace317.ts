/**
 * Source checkout for 2.1.317 self-hosted Runner work assignments.
 * Official reference: chunk-j5svdpw5.js cf()/Ff()/Gf(), uu() clone,
 * branch preparation, and qd() workdir selection.
 *
 * All sources are staged and prepared before they are published. No shell
 * interpreter is involved. The checkout never pushes implicitly; the
 * original runner only does release-time pushes when explicitly configured.
 */
import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const NAME = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const BRANCH = /^(?![-/.])(?!.*(?:\.\.|@\{|\/\/|\\|:\s|\/$|\.lock(?:\/|$)))[A-Za-z0-9._/-]{1,240}$/
type Entry = Record<string, unknown>
type Source = { url: string; revision?: string; repoKey: string; folder: string }
export type RunnerOutcomeBranch317 = {
  repositoryPath: string
  branch: string
  baselineSha: string
}
export type RunnerWorkspace317 = {
  cwd: string
  repositories: readonly string[]
  outcomeBranches: readonly RunnerOutcomeBranch317[]
}
export type RunnerPushResult317 = { pushed: number; unchanged: number; failed: number }
export type RunnerWorkspaceOptions317 = {
  root: string
  sources: readonly unknown[]
  pushTargets: readonly unknown[]
  requestedCwd?: string
  signal: AbortSignal
  workerEpoch?: number
  onStatus?: (message: string) => void
}
function object(value: unknown): value is Entry {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function branchName(value: string): string {
  if (!BRANCH.test(value) || value.split('/').some(p => p === '.' || p === '..')) {
    throw new Error('Remote source contains an unsafe git ref')
  }
  return value
}
function sourceEntry(value: unknown): Source | null {
  if (!object(value)) throw new TypeError('Runner source must be an object')
  if (value.type !== 'git_repository') return null
  if (typeof value.url !== 'string' || /[\x00-\x1f\x7f]/.test(value.url)) {
    throw new TypeError('Runner git source requires a valid URL')
  }
  const url = value.url
  let path: string
  if (/^git@[^\s/:]+:[^\s]+$/.test(url)) {
    path = url.slice(url.indexOf(':') + 1)
  } else {
    let parsed: URL
    try { parsed = new URL(url) }
    catch { throw new TypeError('Runner source URL cannot be parsed') }
    if (!['https:', 'ssh:', 'file:'].includes(parsed.protocol) ||
        parsed.password || parsed.username && parsed.protocol !== 'ssh:' ||
        parsed.search || parsed.hash) {
      throw new TypeError('Runner source must use a supported uncredentialed git URL')
    }
    path = parsed.pathname
  }
  const names = path.replace(/\.git\/?$/, '').replace(/\/$/, '').split('/').filter(Boolean)
  const name = names.at(-1), owner = names.at(-2)
  if (!name || !owner || !NAME.test(name) || !NAME.test(owner)) {
    throw new TypeError('Runner source contains an unsafe repository path')
  }
  const repoKey = (owner + '/' + name).toLowerCase()
  const rawRevision = value.revision
  let revision: string | undefined
  if (typeof rawRevision === 'string') {
    revision = branchName(rawRevision)
  } else if (rawRevision !== undefined) {
    throw new TypeError('Runner source revision must be a string')
  }
  return { url, revision, repoKey, folder: owner + '_' + name }
}
function targetBranches(values: readonly unknown[]): Map<string, string[]> {
  const targets = new Map<string,string[]>()
  for (const value of values) {
    if (!object(value) || value.type !== 'git_repository') continue
    if (!object(value.git_info) || typeof value.git_info.repo !== 'string') {
      throw new TypeError('Runner git push target requires git_info.repo')
    }
    const repo = value.git_info.repo.toLowerCase()
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
      throw new TypeError('Runner push target repository is unsafe')
    }
    const branches = value.git_info.branches
    if (branches !== undefined && (!Array.isArray(branches) ||
       !branches.every(x => typeof x === 'string'))) {
      throw new TypeError('Runner git push target branches are malformed')
    }
    const next = (branches ?? []) as string[]
    targets.set(repo,[...new Set([...(targets.get(repo) ?? []), ...next.map(branchName)])])
  }
  return targets
}
async function git(args: string[], cwd: string, signal: AbortSignal, label: string): Promise<string> {
  try {
    const result = await execFileAsync('git',args,{
      cwd, signal, timeout:120_000,maxBuffer:1024*1024,encoding:'utf8',
      env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_LFS_SKIP_SMUDGE:'1'},
    })
    return result.stdout.trim()
  } catch(error) {
    if (signal.aborted) throw signal.reason ?? error
    throw new Error('Runner git preparation failed ('+label+'): '+
      (error instanceof Error ? error.message : String(error)),{cause:error})
  }
}
async function selectedCommit(path:string, revision:string|undefined,signal:AbortSignal):Promise<string> {
  const candidates = revision
    ? ['refs/remotes/origin/'+revision,revision] : ['HEAD']
  let failure: unknown
  for (const name of candidates) {
    try {
      const commit = await git(['-C',path,'rev-parse','--verify','--end-of-options',
        name+'^{commit}'],path,signal,'resolve ref')
      if (/^[a-fA-F0-9]{40,64}$/.test(commit)) return commit
    } catch (error) { failure=error }
  }
  throw new Error('Remote repository revision cannot be resolved: '+
    (revision ?? 'HEAD'),{cause:failure})
}
async function ensureUnoccupied(path:string):Promise<void> {
  try {
    await lstat(path)
    throw new Error('Runner checkout target already exists: '+path)
  } catch(error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
function safeRequestedDirectory(root:string,relativePath:string):string {
  if (!relativePath || relativePath.includes('\0') ||
      isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath) ||
      relativePath.split(/[\\/]/).some(p=>p==='..')) {
    throw new Error('Runner remote cwd must remain inside the session workspace')
  }
  const result=resolve(root,relativePath)
  if(result!==root && !result.startsWith(root+sep)) {
    throw new Error('Runner remote cwd escapes the session workspace')
  }
  return result
}
export async function prepareRunnerWorkspace317(
  options: RunnerWorkspaceOptions317,
):Promise<RunnerWorkspace317> {
  const root=resolve(options.root)
  if((await realpath(root))!==root) {
    throw new Error('Runner workspace root must not be a symlink')
  }
  const sources=options.sources.map(sourceEntry).filter((v):v is Source=>v!==null)
  const targets=targetBranches(options.pushTargets)
  const folders=new Set<string>()
  for(const src of sources) {
    if(folders.has(src.folder.toLowerCase())) {
      throw new Error('Runner source directory name collision: '+src.folder)
    }
    folders.add(src.folder.toLowerCase())
  }
  const published:string[]=[]
  const outcomeBranches: RunnerOutcomeBranch317[] = []
  const staged=await mkdtemp(join(root,'.runner-checkout-'))
  try {
    const planned:{stage:string;target:string;source:Source;
      branches: {name:string; baselineSha:string}[]}[]=[]
    for(const src of sources) {
      const destination=join(root,src.folder)
      const stage=join(staged,src.folder)
      await ensureUnoccupied(destination)
      options.onStatus?.('[runner:git] preparing '+src.repoKey)
      await git(['clone','--no-checkout','--origin','origin','--',
        src.url,stage],root,options.signal,'clone '+src.repoKey)
      const branches=targets.get(src.repoKey) ?? []
      // A new outcome branch is permitted to be absent on origin. It starts
      // from the source revision, never from a guessed outcome ref.
      const sourceCommit=await selectedCommit(stage,src.revision,options.signal)
      const initialized:{name:string;baselineSha:string}[]=[]
      for(const name of branches) {
        let initial=sourceCommit
        if((options.workerEpoch ?? 1)>1) {
          try {
            await git(['-C',stage,'fetch','--no-write-fetch-head','origin',
              '+refs/heads/'+name+':refs/remotes/origin/'+name],
              stage,options.signal,'resume branch '+src.repoKey)
            initial=await selectedCommit(stage,'refs/remotes/origin/'+name,
              options.signal)
            options.onStatus?.('[runner:git] resumed '+src.repoKey+' '+name)
          } catch(error) {
            if(options.signal.aborted) throw error
            options.onStatus?.('[runner:git] no prior outcome branch for '+src.repoKey+
              ' '+name+'; starting from source revision')
          }
        }
        if(initialized.length===0) {
          await git(['-C',stage,'checkout','-f','-B',name,initial],
            stage,options.signal,'select branch '+src.repoKey)
        } else {
          await git(['-C',stage,'branch','--no-track',name,initial],
            stage,options.signal,'create outcome '+src.repoKey)
        }
        initialized.push({name,baselineSha:initial})
      }
      if(initialized.length===0) {
        await git(['-C',stage,'checkout','--detach','-f',sourceCommit],
          stage,options.signal,'checkout '+src.repoKey)
      }
      planned.push({stage,target:destination,source:src,branches:initialized})
    }
    for(const repo of planned) {
      await ensureUnoccupied(repo.target)
      await rename(repo.stage,repo.target)
      published.push(repo.target)
      for(const branch of repo.branches) {
        outcomeBranches.push({
          repositoryPath:repo.target,branch:branch.name,
          baselineSha:branch.baselineSha,
        })
      }
    }
    const chosenCwd=options.requestedCwd
      ? safeRequestedDirectory(root,options.requestedCwd)
      : published.length===1 ? published[0] : root
    await mkdir(chosenCwd,{recursive:true,mode:0o700})
    if(!(await realpath(chosenCwd)).startsWith(root+sep) &&
       (await realpath(chosenCwd))!==root) {
      throw new Error('Runner cwd resolves outside the session workspace')
    }
    return {cwd:chosenCwd,repositories:published,outcomeBranches}
  }catch(error){
    for(const path of published.reverse()) await rm(path,{recursive:true,force:true})
    throw error
  }finally{
    await rm(staged,{recursive:true,force:true})
  }
}

/**
 * Original 2.1.317: only opt-in non-completed releases preserve outcome refs.
 * Best-effort pushes share one 30-second deadline; the current session must
 * have added commits before anything is sent to the source remote.
 */
export async function pushRunnerOutcomeBranches317(
  branches: readonly RunnerOutcomeBranch317[],
  options: { timeoutMs?: number; onStatus?: (line:string)=>void } = {},
): Promise<RunnerPushResult317> {
  const budgetMs=options.timeoutMs ?? 30_000
  if (!Number.isSafeInteger(budgetMs) || budgetMs<1) {
    throw new RangeError('Runner push window must be a positive integer')
  }
  const deadline=Date.now()+budgetMs
  const result:RunnerPushResult317={pushed:0,unchanged:0,failed:0}
  for(const item of branches) {
    const remaining=deadline-Date.now()
    if(remaining<=0) {
      result.failed++
      options.onStatus?.('[runner:git] push-on-release budget expired for '+item.branch)
      continue
    }
    try {
      const signal=AbortSignal.timeout(remaining)
      const current=await git(['-C',item.repositoryPath,'rev-parse','--verify',
        'refs/heads/'+item.branch],item.repositoryPath,signal,'outcome SHA')
      if(current===item.baselineSha) {
        result.unchanged++
        continue
      }
      await git(['-C',item.repositoryPath,'push','origin',
        'refs/heads/'+item.branch+':refs/heads/'+item.branch],
        item.repositoryPath,signal,'push outcome')
      result.pushed++
      options.onStatus?.('[runner:git] pushed outcome '+item.branch)
    }catch(error){
      result.failed++
      options.onStatus?.('[runner:git] push-on-release failed for '+item.branch+
        ': '+(error instanceof Error?error.message:String(error)))
    }
  }
  return result
}
