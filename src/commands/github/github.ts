import { randomUUID } from 'node:crypto'
import type { LocalCommandCall } from '../../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { githubWorkflow, GITHUB_SCRIPT_PATH, GITHUB_TASK_SCRIPT_PATH, GITHUB_WORKFLOW_PATH, type GithubWorkflowSelection } from './workflow.js'
import { githubReviewerScript } from './reviewerScript.js'
import { githubTaskRunnerScript } from './taskRunnerScript.js'

import { validRepository } from './repository.js'
const HELP = '用法：/github status | auth | repos | setup [owner/repo] [review|respond|both] | secret <owner/repo> <环境变量名> | models | model <owner/repo> <provider/model> | review <owner/repo> <PR> [normal|deep|security] | runs <owner/repo> | run <owner/repo> <运行ID> | cancel <owner/repo> <运行ID> | rerun <owner/repo> <运行ID>'
const result = (value: string): { type:'text'; value:string } => ({type:'text',value})
function validPr(raw: string): string {
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new Error('PR 编号无效')
  return raw
}
async function gh(args: string[], input?: string): Promise<string> {
  const res = await execFileNoThrow('gh', args, {
    timeout:60000, input, preserveOutputOnError:true, useCwd:true,
  })
  if (res.code !== 0) throw new Error(`GitHub 操作失败：${(res.stderr || res.error || '请检查 gh 授权与权限').slice(0,1000)}`)
  return res.stdout.trim()
}
async function checkAuth(): Promise<void> {
  await gh(['auth','status','-h','github.com'])
}
/** Git tree + commit + ref: both workflow files update atomically, with no half-configured branch. */
export async function setupRepository(raw: string, selection: GithubWorkflowSelection = 'both'): Promise<string> {
  if (!['review', 'respond', 'both'].includes(selection)) throw new Error('Actions 类型必须为 review、respond 或 both')
  const repo = validRepository(raw)
  await checkAuth()
  const metadata = JSON.parse(await gh(['api', `repos/${repo}`]))
  if (!metadata.permissions?.push) throw new Error('当前 GitHub 用户缺少仓库写入权限')

  const workflow = githubWorkflow(selection)
  const script = githubReviewerScript()
  const taskScript = githubTaskRunnerScript()
  const main = String(metadata.default_branch)
  async function remoteFile(path: string, ref: string): Promise<string | null> {
    const url = `repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
    const checked = await execFileNoThrow('gh', ['api', url], {
      timeout: 30000, preserveOutputOnError: true, useCwd: true,
    })
    if (checked.code !== 0) {
      if (/HTTP 404|Not Found/i.test(checked.stderr)) return null
      throw new Error(`读取 GitHub 现有配置失败：${checked.stderr || checked.error}`)
    }
    const item = JSON.parse(checked.stdout)
    if (item.type !== 'file' || item.encoding !== 'base64') throw new Error('GitHub 配置文件格式不符合预期')
    return Buffer.from(String(item.content).replace(/\s/g, ''), 'base64').toString('utf8')
  }
  const existing = JSON.parse(await gh([
    'pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200',
    '--json', 'headRefName,headRepositoryOwner,url,createdAt',
  ])) as Array<{ headRefName: string; headRepositoryOwner?: { login?: string }; url: string; createdAt: string }>
  const owner = repo.split('/')[0]?.toLowerCase()
  const reusable = existing
    .filter(item => /^yaoyaoche\/review-[0-9a-f]{8}$/.test(item.headRefName) &&
      item.headRepositoryOwner?.login?.toLowerCase() === owner)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
  if (!reusable) {
    const currentWorkflow = await remoteFile(GITHUB_WORKFLOW_PATH, main)
    const currentScript = await remoteFile(GITHUB_SCRIPT_PATH, main)
    const currentTaskScript = selection === 'review' ? null : await remoteFile(GITHUB_TASK_SCRIPT_PATH, main)
    if (currentWorkflow === workflow && currentScript === script &&
        (selection === 'review' || currentTaskScript === taskScript)) {
      return `仓库 ${repo} 已配置相同的 Actions 工作流`
    }
  }

  // A crash after the atomic branch write but before opening the PR leaves a
  // recoverable branch. Reuse it only if all generated files match exactly.
  if (!reusable) {
    const matching = JSON.parse(await gh(['api',
      `repos/${repo}/git/matching-refs/heads/yaoyaoche/review-`]))
    if (!Array.isArray(matching)) throw new Error('GitHub 分支列表格式不符合预期')
    for (const record of matching.slice(0,40)) {
      const candidate = String(record.ref || '').replace(/^refs\/heads\//,'')
      if (!/^yaoyaoche\/review-[0-9a-f]{8}$/.test(candidate)) continue
      const [remoteWorkflow,remoteScript,remoteTask] = await Promise.all([
        remoteFile(GITHUB_WORKFLOW_PATH,candidate),
        remoteFile(GITHUB_SCRIPT_PATH,candidate),
        selection === 'review' ? Promise.resolve(null) : remoteFile(GITHUB_TASK_SCRIPT_PATH,candidate),
      ])
      if (remoteWorkflow === workflow && remoteScript === script &&
          (selection === 'review' || remoteTask === taskScript)) {
        const body = '## 摇摇车 GitHub 通用集成\n\n从此前配置中断的分支恢复。' +
          '\n请合并本 PR 并单独配置 Actions 模型凭据。'
        return await gh(['pr','create','--repo',repo,'--head',candidate,'--base',main,
          '--title','恢复 摇摇车 GitHub 通用集成配置','--body',body])
      }
    }
  }
  const targetBranch = reusable?.headRefName ??
    `yaoyaoche/review-${randomUUID().slice(0, 8)}`
  const base = reusable ? targetBranch : main
  if (reusable) {
    const currentWorkflow = await remoteFile(GITHUB_WORKFLOW_PATH, targetBranch)
    const currentScript = await remoteFile(GITHUB_SCRIPT_PATH, targetBranch)
    const currentTaskScript = selection === 'review' ? null : await remoteFile(GITHUB_TASK_SCRIPT_PATH, targetBranch)
    if (currentWorkflow === workflow && currentScript === script &&
        (selection === 'review' || currentTaskScript === taskScript)) return reusable.url
  }
  const head = JSON.parse(await gh(['api', `repos/${repo}/git/ref/heads/${base}`]))
  const parent = String(head.object.sha)
  const previous = JSON.parse(await gh(['api', `repos/${repo}/git/commits/${parent}`]))
  const treeElements = [
    { path: GITHUB_WORKFLOW_PATH, mode: '100644', type: 'blob', content: workflow },
    { path: GITHUB_SCRIPT_PATH, mode: '100644', type: 'blob', content: script },
    ...(selection === 'review' ? [] : [
      { path: GITHUB_TASK_SCRIPT_PATH, mode: '100644', type: 'blob', content: taskScript },
    ]),
  ]
  const tree = JSON.parse(await gh(['api', '--method', 'POST', `repos/${repo}/git/trees`, '--input', '-'],
    JSON.stringify({ base_tree: previous.tree.sha, tree: treeElements })))
  const commit = JSON.parse(await gh(['api', '--method', 'POST', `repos/${repo}/git/commits`, '--input', '-'],
    JSON.stringify({ message: '更新 摇摇车 通用 GitHub Actions 与多模型审查',
      tree: tree.sha, parents: [parent] })))
  if (reusable) {
    await gh(['api', '--method', 'PATCH', `repos/${repo}/git/refs/heads/${targetBranch}`,
      '-f', `sha=${commit.sha}`, '-F', 'force=false'])
    return reusable.url
  }
  await gh(['api', '--method', 'POST', `repos/${repo}/git/refs`,
    '-f', `ref=refs/heads/${targetBranch}`, '-f', `sha=${commit.sha}`])
  const body = [
    '## 摇摇车 GitHub 通用集成',
    '通过 GitHub Actions 运行多模型代码审查和授权成员的评论开发任务。',
    '### 启用步骤',
    '1. 审查并合并本 PR，使工作流进入仓库默认分支。',
    '2. 使用 /github models 查看可复用的本地 API 模型。',
    '3. 明确确认后用 /github model <owner/repo> <provider/model> 单独配置 Actions 凭据。',
    '4. 通过 /yaoyaoche review deep 审查，或 /yaoyaoche task <开发要求> 执行开发任务。',
    'ChatGPT OAuth 保留在本机，GitHub Actions 需要单独的 API Key。',
  ].join('\n')
  try {
    return await gh(['pr', 'create', '--repo', repo, '--head', targetBranch, '--base', main,
      '--title', '接入 摇摇车 通用 GitHub Actions 与多模型审查', '--body', body])
  } catch (error) {
    throw new Error(`配置已提交到分支 ${targetBranch}，但 PR 创建失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
export async function dispatchReview(rawRepo: string, rawPr: string, mode='normal'): Promise<string> {
  const repo = validRepository(rawRepo)
  const pr = validPr(rawPr)
  if (!['normal','deep','security'].includes(mode)) throw new Error('审查模式无效')
  await checkAuth()
  await gh(['workflow','run','yaoyaoche-review.yml','--repo',repo,'-f',`pr_number=${pr}`,'-f',`mode=${mode}`])
  return `已提交审查任务至 GitHub Actions。完成后在 PR #${pr} 查看评论及 Artifact： https://github.com/${repo}/actions/workflows/yaoyaoche-review.yml`
}
export const call: LocalCommandCall = async (args) => {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const action = tokens[0] || 'help'
  try {
    if (action === 'help') return result(HELP)
    if (action === 'auth') return result('运行 gh auth login -h github.com 进行 GitHub OAuth 登录。配置 Actions 时需要 gh auth refresh -h github.com -s repo,workflow；无需 Claude 账号。')
    if (action === 'status') {
      await checkAuth()
      const auth = '已通过 GitHub CLI OAuth 授权检查'
      const current = await execFileNoThrow('gh',['repo','view','--json','nameWithOwner','--jq','.nameWithOwner'],{timeout:10000,useCwd:true})
      return result(`${auth}\n当前仓库：${current.code===0 ? current.stdout.trim() : '未识别'}`)
    }
    if (action === 'models') {
      const { getGithubModelOptions } = await import('./modelConfig.js')
      const models = getGithubModelOptions()
      return result(models.length ? models.map(m=>`${m.id} · ${m.credentialSource}`).join('\n') :
        '暂无可用于 Actions 的 API 模型；ChatGPT OAuth 无法用于 Actions。请先通过 /model 配置 API Key。')
    }
    if (action === 'model' && tokens.length===3) {
      const { configureGithubModel } = await import('./modelConfig.js')
      return result(await configureGithubModel(tokens[1], tokens[2], true))
    }
    if (action === 'repos') {
      await checkAuth()
      return result(`可访问的仓库：\n${await gh(['repo','list','--limit','100','--json','nameWithOwner','--jq','.[].nameWithOwner'])}`)
    }
    if (action === 'setup' && tokens.length<=3) {
      await checkAuth()
      let selectedRepo = tokens[1]
      if (!selectedRepo) {
        const current = await execFileNoThrow('gh',
          ['repo','view','--json','nameWithOwner','--jq','.nameWithOwner'],
          {timeout:10000,useCwd:true})
        if (current.code !== 0 || !current.stdout.trim())
          throw new Error('当前目录无 GitHub 仓库，请先通过 /github repos 选择 owner/repo')
        selectedRepo = current.stdout.trim()
      }
      const selection = tokens[2] || 'both'
      if (!['review','respond','both'].includes(selection)) throw new Error('请选择 review、respond 或 both')
      return result(`GitHub 配置结果：${await setupRepository(selectedRepo, selection as GithubWorkflowSelection)}`)
    }
    if (action === 'secret' && tokens.length===3) {
      const repo = validRepository(tokens[1])
      const name = tokens[2]
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error('环境变量名无效')
      const secret = process.env[name]
      if (!secret) throw new Error('本机环境变量不存在，密钥只从本机环境读取')
      await checkAuth()
      await gh(['secret','set','YAOYAOCHE_MODEL_API_KEY','--repo',repo],secret)
      return result('Secret YAOYAOCHE_MODEL_API_KEY 写入成功，密钥值未输出。')
    }
    if (action === 'review' && tokens.length>=3 && tokens.length<=4)
      return result(await dispatchReview(tokens[1],tokens[2],tokens[3] || 'normal'))
    if (['run','cancel','rerun'].includes(action) && tokens.length===3) {
      await checkAuth()
      const repo = validRepository(tokens[1])
      const id = validPr(tokens[2])
      if (action === 'run') {
        return result(await gh(['run','view',id,'--repo',repo,'--json','databaseId,displayTitle,status,conclusion,url','--jq','.']))
      }
      if (action === 'cancel') {
        return result(`已请求取消：${await gh(['run','cancel',id,'--repo',repo])}`)
      }
      return result(`已请求重新执行：${await gh(['run','rerun',id,'--repo',repo])}`)
    }
    if (action === 'runs' && tokens.length===2) {
      await checkAuth()
      return result(await gh(['run','list','--repo',validRepository(tokens[1]),'--workflow','yaoyaoche-review.yml','--limit','10']))
    }
    return result(HELP)
  } catch (error) {
    return result(`GitHub 操作失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
