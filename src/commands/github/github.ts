import { randomUUID } from 'node:crypto'
import type { LocalCommandCall } from '../../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { githubWorkflow, GITHUB_SCRIPT_PATH, GITHUB_WORKFLOW_PATH } from './workflow.js'
import { githubReviewerScript } from './reviewerScript.js'

const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/
const HELP = '用法：/github status | auth | repos | setup <owner/repo> | secret <owner/repo> <本机环境变量名> | review <owner/repo> <PR> [normal|deep|security|extreme] | runs <owner/repo>'
const result = (value: string): { type:'text'; value:string } => ({type:'text',value})
export function validRepository(raw: string): string {
  const value = raw.replace(/^https:\/\/github\.com\//,'').replace(/\.git$/,'')
  if (!REPO.test(value) || value.includes('..') || value.endsWith('/.'))
    throw new Error('GitHub 仓库应为 owner/repo，且不能包含额外路径或域名')
  return value
}
function validPr(raw: string): string {
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new Error('PR 编号无效')
  return raw
}
async function gh(args: string[], input?: string): Promise<string> {
  const res = await execFileNoThrow('gh', args, {
    timeout:60000, input, preserveOutputOnError:true,
  })
  if (res.code !== 0) throw new Error('GitHub 操作失败：' + (res.stderr || res.error || '请检查 gh 授权与权限').slice(0,1000))
  return res.stdout.trim()
}
async function checkAuth(): Promise<void> {
  await gh(['auth','status','-h','github.com'])
}
async function addFile(repo: string, path: string, content: string, branch: string): Promise<void> {
  const base64 = Buffer.from(content, 'utf8').toString('base64')
  await gh(['api','--method','PUT','repos/' + repo + '/contents/' + path,
    '-f','message=配置 333 通用工作流','-f','content=' + base64, '-f','branch=' + branch])
}
export async function setupRepository(raw: string): Promise<string> {
  const repo = validRepository(raw)
  await checkAuth()
  const metadata = JSON.parse(await gh(['api','repos/' + repo]))
  if (!metadata.permissions?.push) throw new Error('当前 GitHub 用户缺少写入权限')
  const base = String(metadata.default_branch)
  const head = JSON.parse(await gh(['api','repos/' + repo + '/git/ref/heads/' + base]))
  const branch = '333/review-' + randomUUID().slice(0,8)
  await gh(['api','--method','POST','repos/' + repo + '/git/refs',
    '-f','ref=refs/heads/' + branch,'-f','sha=' + String(head.object.sha)])
  await addFile(repo, GITHUB_WORKFLOW_PATH, githubWorkflow(), branch)
  await addFile(repo, GITHUB_SCRIPT_PATH, githubReviewerScript(), branch)
  const body = '## 333 GitHub 通用集成\n\n使用 GitHub Actions 执行多模型代码审查与极深复核，可通过授权用户 @333 触发。' +
    '\n配置 Actions Secret THREE333_MODEL_API_KEY、变量 THREE333_MODEL_NAME 和 THREE333_MODEL_PROVIDER。' +
    '\n支持 OpenAI 兼容协议、Anthropic 和 Gemini。GitHub 自身授权与模型授权独立。'
  return await gh(['pr','create','--repo',repo,'--head',branch,'--base',base,
    '--title','接入 333 通用 GitHub Actions 与多模型极深审查','--body',body])
}
export async function dispatchExtremeReview(rawRepo: string, rawPr: string, mode='extreme'): Promise<string> {
  const repo = validRepository(rawRepo)
  const pr = validPr(rawPr)
  if (!['normal','deep','security','extreme'].includes(mode)) throw new Error('审查模式无效')
  await checkAuth()
  await gh(['workflow','run','333-review.yml','--repo',repo,'-f','pr_number='+pr,'-f','mode='+mode])
  return '已提交审查任务至 GitHub Actions。完成后在 PR #' + pr +
    ' 查看评论及 Artifact： https://github.com/' + repo + '/actions/workflows/333-review.yml'
}
export const call: LocalCommandCall = async (args) => {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const action = tokens[0] || 'help'
  try {
    if (action === 'help') return result(HELP)
    if (action === 'auth') return result('运行 gh auth login -h github.com 进行 GitHub OAuth 登录。配置 Actions 时需要 gh auth refresh -h github.com -s repo,workflow；无需 Claude 账号。')
    if (action === 'status') {
      const auth = await gh(['auth','status','-h','github.com'])
      const current = await execFileNoThrow('gh',['repo','view','--json','nameWithOwner','--jq','.nameWithOwner'],{timeout:10000})
      return result(auth + '\n当前仓库：' + (current.code===0 ? current.stdout.trim() : '未识别'))
    }
    if (action === 'repos') {
      await checkAuth()
      return result('可访问的仓库：\n' + await gh(['repo','list','--limit','100','--json','nameWithOwner','--jq','.[].nameWithOwner']))
    }
    if (action === 'setup' && tokens.length===2) return result('已创建配置 PR：' + await setupRepository(tokens[1]))
    if (action === 'secret' && tokens.length===3) {
      const repo = validRepository(tokens[1])
      const name = tokens[2]
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error('环境变量名无效')
      const secret = process.env[name]
      if (!secret) throw new Error('本机环境变量不存在，密钥只从本机环境读取')
      await checkAuth()
      await gh(['secret','set','THREE333_MODEL_API_KEY','--repo',repo],secret)
      return result('Secret THREE333_MODEL_API_KEY 写入成功，密钥值未输出。')
    }
    if (action === 'review' && tokens.length>=3 && tokens.length<=4)
      return result(await dispatchExtremeReview(tokens[1],tokens[2],tokens[3] || 'extreme'))
    if (action === 'runs' && tokens.length===2) {
      await checkAuth()
      return result(await gh(['run','list','--repo',validRepository(tokens[1]),'--workflow','333-review.yml','--limit','10']))
    }
    return result(HELP)
  } catch (error) {
    return result('GitHub 操作失败：' + (error instanceof Error ? error.message : String(error)))
  }
}
