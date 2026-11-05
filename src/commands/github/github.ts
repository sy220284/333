import { randomUUID } from 'node:crypto'
import type { LocalCommandCall } from '../../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { githubWorkflow, GITHUB_SCRIPT_PATH, GITHUB_WORKFLOW_PATH } from './workflow.js'
import { githubReviewerScript } from './reviewerScript.js'

import { validRepository } from './repository.js'
const HELP = '用法：/github status | auth | repos | setup <owner/repo> | secret <owner/repo> <环境变量名> | review <owner/repo> <PR> [normal|deep|security|extreme] | runs <owner/repo> | run <owner/repo> <运行ID> | cancel <owner/repo> <运行ID> | rerun <owner/repo> <运行ID>'
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
  if (res.code !== 0) throw new Error('GitHub 操作失败：' + (res.stderr || res.error || '请检查 gh 授权与权限').slice(0,1000))
  return res.stdout.trim()
}
async function checkAuth(): Promise<void> {
  await gh(['auth','status','-h','github.com'])
}
/** Git tree + commit + ref: both workflow files update atomically, with no half-configured branch. */
export async function setupRepository(raw: string): Promise<string> {
  const repo = validRepository(raw)
  await checkAuth()
  const metadata = JSON.parse(await gh(['api','repos/' + repo]))
  if (!metadata.permissions?.push) throw new Error('当前 GitHub 用户缺少仓库写入权限')
  const base = String(metadata.default_branch)
  const head = JSON.parse(await gh(['api','repos/' + repo + '/git/ref/heads/' + base]))
  const parent = String(head.object.sha)
  const treeInfo = JSON.parse(await gh(['api','repos/' + repo + '/git/commits/' + parent]))
  const elements = [
    {path:GITHUB_WORKFLOW_PATH,mode:'100644',type:'blob',content:githubWorkflow()},
    {path:GITHUB_SCRIPT_PATH,mode:'100644',type:'blob',content:githubReviewerScript()},
  ]
  const tree = JSON.parse(await gh(['api','--method','POST','repos/' + repo + '/git/trees','--input','-'],
    JSON.stringify({base_tree:treeInfo.tree.sha,tree:elements})))
  const commit = JSON.parse(await gh(['api','--method','POST','repos/' + repo + '/git/commits','--input','-'],
    JSON.stringify({message:'接入 333 通用 GitHub Actions 及多模型极深审查',
      tree:tree.sha,parents:[parent]})))
  const branch = '333/review-' + randomUUID().slice(0,8)
  await gh(['api','--method','POST','repos/' + repo + '/git/refs',
    '-f','ref=refs/heads/' + branch,'-f','sha=' + commit.sha])
  const body = '## 333 GitHub 通用集成\\n\\n使用 GitHub Actions 执行多模型代码审查与极深复核，可通过授权用户 @333 触发。' +
    '\\n配置 Actions Secret THREE333_MODEL_API_KEY、变量 THREE333_MODEL_NAME 和 THREE333_MODEL_PROVIDER。' +
    '\\n支持 OpenAI 兼容协议、Anthropic 和 Gemini。GitHub 自身授权与模型授权独立。'
  try {
    return await gh(['pr','create','--repo',repo,'--head',branch,'--base',base,
      '--title','接入 333 通用 GitHub Actions 与多模型极深审查','--body',body])
  } catch (error) {
    throw new Error('两个配置文件已原子提交到分支 '+branch+'；创建配置 PR 失败，请以该分支重试。' +
      (error instanceof Error ? error.message : String(error)))
  }
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
      await checkAuth()
      const auth = '已通过 GitHub CLI OAuth 授权检查'
      const current = await execFileNoThrow('gh',['repo','view','--json','nameWithOwner','--jq','.nameWithOwner'],{timeout:10000,useCwd:true})
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
    if (['run','cancel','rerun'].includes(action) && tokens.length===3) {
      await checkAuth()
      const repo = validRepository(tokens[1])
      const id = validPr(tokens[2])
      if (action === 'run') {
        return result(await gh(['run','view',id,'--repo',repo,'--json','databaseId,displayTitle,status,conclusion,url','--jq','.']))
      }
      if (action === 'cancel') {
        return result('已请求取消：'+ await gh(['run','cancel',id,'--repo',repo]))
      }
      return result('已请求重新执行：'+ await gh(['run','rerun',id,'--repo',repo]))
    }
    if (action === 'runs' && tokens.length===2) {
      await checkAuth()
      return result(await gh(['run','list','--repo',validRepository(tokens[1]),'--workflow','333-review.yml','--limit','10']))
    }
    return result(HELP)
  } catch (error) {
    return result('GitHub 操作失败：' + (error instanceof Error ? error.message : String(error)))
  }
}
