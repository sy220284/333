import * as React from 'react'
import { useEffect, useState } from 'react'
import { execa } from 'execa'
import { Box, Text } from '../../ink.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Select } from '../../components/CustomSelect/select.js'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { call as runGithubCommand, setupRepository } from './github.js'
import { getGithubModelOptions, configureGithubModel, type GithubModelOption } from './modelConfig.js'
import type { GithubWorkflowSelection } from './workflow.js'
import { validRepository } from './repository.js'

type Stage = 'overview' | 'repos' | 'workflow' | 'models' | 'confirm' | 'finished'
type Repository = { nameWithOwner: string; isPrivate?: boolean }
function Wizard({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [stage, setStage] = useState<Stage>('overview')
  const [busy, setBusy] = useState(true)
  const [status, setStatus] = useState('正在检查 GitHub CLI 和授权…')
  const [authorized, setAuthorized] = useState(false)
  const [repos, setRepos] = useState<Repository[]>([])
  const [repo, setRepo] = useState('')
  const [workflow, setWorkflow] = useState<GithubWorkflowSelection>('both')
  const [models, setModels] = useState<GithubModelOption[]>([])
  const [model, setModel] = useState('')
  const [result, setResult] = useState('')

  async function reload(): Promise<void> {
    setBusy(true)
    try {
      const check = await execFileNoThrow('gh', ['auth','status','-h','github.com'], {
        timeout:15000, preserveOutputOnError:true, useCwd:true,
      })
      setAuthorized(check.code === 0)
      if (check.code === 0) {
        const list = await execFileNoThrow('gh',
          ['repo','list','--limit','100','--json','nameWithOwner,isPrivate'], {
            timeout:20000, preserveOutputOnError:true, useCwd:true,
          })
        if (list.code !== 0) throw new Error(list.stderr || list.error || '读取仓库失败')
        const found = JSON.parse(list.stdout) as Repository[]
        if (!Array.isArray(found)) throw new Error('GitHub 仓库返回格式错误')
        setRepos(found)
        const current = await execFileNoThrow('gh',
          ['repo','view','--json','nameWithOwner','--jq','.nameWithOwner'], {
            timeout:10000, useCwd:true,
          })
        if (current.code === 0 && current.stdout.trim()) setRepo(current.stdout.trim())
        setStatus('GitHub 已授权。可选择仓库、模型和安装方式。')
      } else {
        setStatus('尚未授权。选择「登录 GitHub」后按浏览器提示完成授权。')
      }
      setModels(getGithubModelOptions())
    } catch (error) {
      setStatus('GitHub 初始化失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { void reload() }, [])

  async function login(): Promise<void> {
    setBusy(true)
    setStatus('正在启动 GitHub 浏览器授权…')
    try {
      const child = execa('gh', [
        'auth', 'login', '--hostname', 'github.com',
        '--web', '--git-protocol', 'https', '--scopes', 'repo,workflow',
      ], { reject:false, timeout:180000, stdin:'ignore' })
      const notify = (chunk: Buffer | string) => {
        const line = String(chunk).replace(/\u001b\[[0-9;]*m/g,'').trim()
        if (line) setStatus(line.slice(-1200))
      }
      child.stdout?.on('data',notify)
      child.stderr?.on('data',notify)
      const completed = await child
      if (completed.exitCode !== 0) {
        throw new Error(completed.stderr || completed.shortMessage || '登录未完成')
      }
      await reload()
    } catch (error) {
      setStatus('GitHub 登录失败：' + (error instanceof Error ? error.message : String(error)))
      setBusy(false)
    }
  }
  async function perform(transferKey: boolean): Promise<void> {
    setBusy(true)
    try {
      const name = validRepository(repo)
      setStatus('检查仓库权限并创建 GitHub Actions 配置 PR…')
      const url = await setupRepository(name, workflow)
      if (transferKey) {
        if (!model) throw new Error('尚未选择模型')
        setStatus('将选定 API 凭据独立写入 GitHub Actions Secrets…')
        await configureGithubModel(name,model,true)
      }
      const output = 'GitHub 配置 PR：' + url +
        '\n仓库：' + name +
        '\n功能：' + workflow +
        '\n模型：' + (transferKey ? model : '稍后独立配置') +
        '\n请检查并合并配置 PR，工作流才会在仓库默认分支生效。'
      setResult(output)
      setStatus('配置完成，请检查并合并安装 PR。')
      setStage('finished')
    } catch (error) {
      setStatus('配置失败：' + (error instanceof Error ? error.message : String(error)) +
        '。可保留当前选择重试。')
    } finally {
      setBusy(false)
    }
  }
  function chooseMenu(value: string) {
    if (value === 'login') { void login(); return }
    if (value === 'refresh') { void reload(); return }
    if (value === 'exit') { onDone('已退出 GitHub 配置向导'); return }
    setStage('repos')
  }
  const repoOptions = [
    ...(repo ? [{label:'当前仓库：'+repo,value:repo}] : []),
    ...repos.filter(r=>r.nameWithOwner !== repo).map(r=>({
      label: r.nameWithOwner+(r.isPrivate?'（私有）':''),value:r.nameWithOwner,
    })),
    {label:'输入其他仓库地址',value:'__manual__',type:'input' as const,
      placeholder:'owner/repo 或 https://github.com/owner/repo',
      onChange: (value:string) => {
        try {setRepo(validRepository(value)); setStage('workflow')}
        catch(error) {setStatus(error instanceof Error ? error.message : String(error))}
      }},
  ]
  const modelOptions = [
    ...models.map(m=>({label:m.label,value:m.id,
      description:m.credentialSource})),
    {label:'先安装工作流，稍后配置独立 Actions API Key',value:'__later__'},
  ]
  return <Dialog title="GitHub · 摇摇车仓库集成" subtitle="GitHub 授权与模型密钥分别管理"
    onCancel={()=>onDone('已退出 GitHub 配置向导')} isCancelActive={!busy}>
    <Box flexDirection="column" gap={1}>
      <Text dimColor>{status}</Text>
      {busy && <Text color="permission">正在处理…</Text>}
      {!busy && stage === 'overview' && <Select
        options={[
          {label:authorized?'重新授权 GitHub':'登录 GitHub',value:'login'},
          {label:'选择仓库并配置 Actions',value:'setup',disabled:!authorized},
          {label:'刷新 GitHub 授权及仓库',value:'refresh'},
          {label:'退出',value:'exit'},
        ]} onChange={chooseMenu} onCancel={()=>onDone()}/>}
      {!busy && stage === 'repos' && <Select options={repoOptions}
        onChange={value=>{
          if(value !== '__manual__') {
            setRepo(value); setStage('workflow')
          }
        }} onCancel={()=>setStage('overview')}/>}
      {!busy && stage === 'workflow' && <Select options={[
        {label:'代码审查 + 授权评论开发任务',value:'both'},
        {label:'只运行代码审查',value:'review'},
        {label:'只响应授权评论开发任务',value:'respond'},
      ]} onChange={value=>{
        setWorkflow(value as GithubWorkflowSelection); setStage('models')
      }} onCancel={()=>setStage('repos')}/>}
      {!busy && stage === 'models' && <Select options={modelOptions}
        onChange={value=>{
          setModel(value === '__later__' ? '' : value)
          setStage('confirm')
        }} onCancel={()=>setStage('workflow')}/>}
      {!busy && stage === 'confirm' && <Box flexDirection="column" gap={1}>
        <Text>仓库：{repo}　工作流：{workflow}</Text>
        <Text>模型：{model || '稍后配置'}</Text>
        <Text dimColor>选择上传会将所选本机 API Key 写入该仓库的 Actions Secret；不会上传 ChatGPT OAuth 凭据。</Text>
        <Select options={[
          ...(model ? [{label:'确认安装并上传所选模型 API Key',value:'upload'}] : []),
          {label:'仅安装工作流，稍后配置 Actions 密钥',value:'install'},
          {label:'返回修改',value:'back'},
        ]} onChange={value=>{
          if (value === 'back') setStage('models')
          else void perform(value === 'upload')
        }} onCancel={()=>setStage('models')}/>
      </Box>}
      {!busy && stage === 'finished' && <Box flexDirection="column" gap={1}>
        <Text>{result}</Text>
        <Select options={[{label:'完成',value:'close'},
          {label:'配置另一仓库',value:'again'}]}
          onChange={value=>{
            if(value === 'again') setStage('repos')
            else onDone(result)
          }} onCancel={()=>onDone(result)}/>
      </Box>}
    </Box>
  </Dialog>
}
export const call: LocalJSXCommandCall = async (onDone,context,args) => {
  if (args.trim()) {
    const result = await runGithubCommand(args,context)
    if (result.type === 'text') onDone(result.value)
    else onDone()
    return null
  }
  return <Wizard onDone={onDone}/>
}
