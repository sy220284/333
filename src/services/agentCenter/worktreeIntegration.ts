/**
 * Native Git, no implicit integration. Prepare an immutable merge commit from
 * a verified AgentTool worktree and apply it with git reset --keep so local
 * changes are not silently overwritten. A failed validation performs no
 * checkout, branch update or model call.
 */
import { createHash } from 'node:crypto'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as lockfile from '../../utils/lockfile.js'
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'

export type IntegrationPreview = {
  canIntegrate: boolean
  alreadyIntegrated: boolean
  reason?: string
  targetHead: string
  sourceHead: string
  changes: string
  commits: string
  mergeTree?: string
}
type GitResult = { stdout: string; stderr: string; code: number; error?: string }
async function git(cwd: string, ...args: string[]): Promise<GitResult> {
  return execFileNoThrowWithCwd('git', args, { cwd, timeout: 120_000 })
}
async function checked(cwd: string, ...args: string[]): Promise<string> {
  const result = await git(cwd, ...args)
  if (result.code !== 0) throw new Error(`Git 操作失败：${args.slice(0,3).join(' ')}；${(result.stderr || result.error || result.stdout || '请检查仓库状态').slice(0,900)}`)
  return result.stdout.trim()
}
const sha = /^[0-9a-f]{40,64}$/
function verifyCommit(value: string, reason: string): string {
  if (!sha.test(value)) throw new Error(reason)
  return value
}
async function commonRepo(dir: string): Promise<string> {
  const result = await checked(dir,'rev-parse','--path-format=absolute','--git-common-dir')
  return realpath(result)
}
export async function previewWorktreeIntegration(
  projectDir: string, sourceDir: string, baseline: string,
): Promise<IntegrationPreview> {
  const target = await realpath(resolve(projectDir))
  const source = await realpath(resolve(sourceDir))
  if (source === target) throw new Error('待合入工作树与当前项目相同，无法验证隔离边界')
  const [destination, origin] = await Promise.all([
    checked(target,'rev-parse','--show-toplevel'),
    checked(source,'rev-parse','--show-toplevel'),
  ])
  if (await realpath(destination) !== target || await realpath(origin) !== source)
    throw new Error('工作树包含嵌套 Git 仓库或不可信目录')
  if (await commonRepo(target) !== await commonRepo(source))
    throw new Error('工作项和目标项目不属于同一个 Git 仓库')
  const [targetHead, sourceHead, targetStatus, sourceStatus] = await Promise.all([
    checked(target,'rev-parse','HEAD'),
    checked(source,'rev-parse','HEAD'),
    checked(target,'status','--porcelain'),
    checked(source,'status','--porcelain'),
  ])
  verifyCommit(targetHead,'项目目标提交无效')
  verifyCommit(sourceHead,'工作项提交无效')
  verifyCommit(baseline,'任务初始提交无效')
  if ((await git(source,'merge-base','--is-ancestor',baseline,sourceHead)).code !== 0)
    throw new Error('任务工作树已偏离最初分支，需核对是否发生重写历史')
  const changes = await checked(source,'diff','--stat',`${baseline}..${sourceHead}`)
  const commits = await checked(source,'log','--oneline',`${baseline}..${sourceHead}`)
  if (targetStatus || sourceStatus)
    return { canIntegrate:false,alreadyIntegrated:false,reason:'主项目或工作树存在未提交改动，请先保存或提交',targetHead,sourceHead,changes,commits }
  const integrated = (await git(target,'merge-base','--is-ancestor',sourceHead,targetHead)).code===0
  if (integrated) return { canIntegrate:false,alreadyIntegrated:true,targetHead,sourceHead,changes,commits,reason:'代码已经合入项目' }
  if (!commits) return { canIntegrate:false,alreadyIntegrated:false,targetHead,sourceHead,changes,commits,reason:'工作树没有可合入的提交' }
  // git merge-tree only writes a tree object, without updating the index.
  const result = await git(target,'merge-tree','--write-tree',targetHead,sourceHead)
  if (result.code !== 0)
    return { canIntegrate:false,alreadyIntegrated:false,targetHead,sourceHead,changes,commits,
      reason:`合并预检发现冲突：${(result.stdout || result.stderr).slice(0,1000)}` }
  const mergeTree = verifyCommit(result.stdout.trim().split(/\s+/)[0] ?? '', '合并树对象校验失败')
  return { canIntegrate:true,alreadyIntegrated:false,targetHead,sourceHead,changes,commits,mergeTree }
}
export async function integrateWorktree(
  projectDir: string, sourceDir: string, baseline: string,
  expectedTargetHead: string, expectedSourceHead: string, lockRoot: string,
): Promise<{ mergeCommit: string; alreadyIntegrated: boolean }> {
  verifyCommit(expectedTargetHead,'目标提交签名无效')
  verifyCommit(expectedSourceHead,'工作项提交签名无效')
  const project = await realpath(projectDir)
  const locks = join(lockRoot, 'agent-integration-locks')
  await mkdir(locks,{recursive:true,mode:0o700})
  const file = join(locks,`${createHash('sha256').update(project).digest('hex')}.lock`)
  try { await writeFile(file,'', {flag:'wx',mode:0o600}) }
  catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error }
  const unlock = await lockfile.lock(file,{retries:{retries:8,minTimeout:40,maxTimeout:350}})
  try {
    const check = await previewWorktreeIntegration(project,sourceDir,baseline)
    if(check.alreadyIntegrated) return {mergeCommit:check.targetHead,alreadyIntegrated:true}
    if (!check.canIntegrate || !check.mergeTree) throw new Error(check.reason || '合入前状态检查失败')
    if(check.targetHead!==expectedTargetHead||check.sourceHead!==expectedSourceHead)
      throw new Error('审核后源代码或主项目已变化，请重新预览合入')
    // Detached merge commit; the checked-out branch is unchanged until reset --keep succeeds.
    const mergeCommit=verifyCommit(await checked(project,'commit-tree',check.mergeTree,
      '-p',check.targetHead,'-p',check.sourceHead,'-m','合入独立智能体已审核工作项'), '合并提交生成失败')
    // Re-check HEAD, then Git's --keep protects edits made after the preview.
    if(await checked(project,'rev-parse','HEAD')!==expectedTargetHead)
      throw new Error('项目 HEAD 已变化，停止合入')
    const reset=await git(project,'reset','--keep',mergeCommit)
    if(reset.code!==0)throw new Error(`应用合并提交失败，主工作区保持原状：${(reset.stderr||reset.stdout).slice(0,900)}`)
    if(await checked(project,'rev-parse','HEAD')!==mergeCommit)
      throw new Error('合入提交写入后无法验证当前分支')
    return {mergeCommit,alreadyIntegrated:false}
  }finally{await unlock()}
}
