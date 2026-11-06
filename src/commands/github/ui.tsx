import * as React from 'react'
import { useEffect, useState } from 'react'
import { execa } from 'execa'
import { Box, Text } from '../../ink.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Select } from '../../components/CustomSelect/select.js'
import TextInput from '../../components/TextInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { call as runGithubCommand, setupRepository } from './github.js'
import { getGithubModelOptions, configureGithubWizardModel, verifyGithubExistingActionsModel,
  getGithubActionsProviderOptions, type GithubModelOption, type GithubActionsProvider } from './modelConfig.js'
import type { GithubWorkflowSelection } from './workflow.js'
import { validRepository } from './repository.js'

type Stage = 'overview' | 'repos' | 'workflow' | 'models' | 'provider' | 'model-name' | 'api-key' | 'confirm' | 'finished'
type Repository = { nameWithOwner: string; isPrivate?: boolean }
function Wizard({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const terminal = useTerminalSize()
  const [nameCursor, setNameCursor] = useState(0)
  const [keyCursor, setKeyCursor] = useState(0)
  const [stage, setStage] = useState<Stage>('overview')
  const [busy, setBusy] = useState(true)
  const [status, setStatus] = useState('正在检查 GitHub CLI 和授权…')
  const [authorized, setAuthorized] = useState(false)
  const [repos, setRepos] = useState<Repository[]>([])
  const [repo, setRepo] = useState('')
  const [workflow, setWorkflow] = useState<GithubWorkflowSelection>('both')
  const [models, setModels] = useState<GithubModelOption[]>([])
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<GithubActionsProvider>('openai')
  const [newModel, setNewModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [entry, setEntry] = useState('')
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
      setStatus(`GitHub 初始化失败：${error instanceof Error ? error.message : String(error)}`)
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
      ], { reject:false, timeout:180000, stdin:'pipe' })
      let displayed = ''
      let pressedEnter = false
      const notify = (chunk: Buffer | string) => {
        displayed = (displayed + String(chunk).replace(new RegExp(String.raw`\x1b\[[0-9;]*m`, 'g'),'')).slice(-2500)
        setStatus(displayed.slice(-1200))
        if (!pressedEnter && /press enter|按回车|按下回车/i.test(displayed)) {
          pressedEnter = true
          child.stdin?.write('\n')
        }
      }
      child.stdout?.on('data',notify)
      child.stderr?.on('data',notify)
      const completed = await child
      if (completed.exitCode !== 0) {
        throw new Error(completed.stderr || completed.shortMessage || '登录未完成')
      }
      await reload()
    } catch (error) {
      setStatus(`GitHub 登录失败：${error instanceof Error ? error.message : String(error)}`)
      setBusy(false)
    }
  }
  async function perform(transferKey: boolean, reuseExisting = false): Promise<void> {
    setBusy(true)
    try {
      const name = validRepository(repo)
      const existing = reuseExisting ? await verifyGithubExistingActionsModel(name) : ''
      setStatus('检查仓库权限并创建 GitHub Actions 配置 PR…')
      const url = await setupRepository(name, workflow)
      if (transferKey) {
        setStatus('将选定 API 凭据独立写入 GitHub Actions Secrets…')
        await configureGithubWizardModel(name,
          entry === 'new'
            ? { kind: 'new', provider, model: newModel, apiKey }
            : { kind: 'saved', id: model },
          true,
        )
      }
      const output = `GitHub 配置 PR：${url}\n仓库：${name}\n功能：${workflow}\n模型：${reuseExisting ? existing : transferKey ? (entry === 'new' ? `${provider}/${newModel}` : model) : '稍后独立配置'}\n请检查并合并配置 PR，工作流才会在仓库默认分支生效。`
      setApiKey('')
      setResult(output)
      setStatus('配置完成，请检查并合并安装 PR。')
      setStage('finished')
    } catch (error) {
      setStatus(`配置失败：${error instanceof Error ? error.message : String(error)}。可保留当前选择重试。`)
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
    ...(repo ? [{label:`当前仓库：${repo}`,value:repo}] : []),
    ...repos.filter(r=>r.nameWithOwner !== repo).map(r=>({
      label: `${r.nameWithOwner}${r.isPrivate?'（私有）':''}`,value:r.nameWithOwner,
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
    {label:'配置新的 GitHub Actions API Key',value:'__new__'},
    {label:'复用仓库已有 Actions Secret 与模型变量',value:'__existing__'},
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
          if (value === '__existing__') {
            setEntry('existing')
            setModel('')
            setStage('confirm')
          } else if (value === '__new__') {
            setEntry('new')
            setModel('')
            setStage('provider')
          } else {
            setEntry(value === '__later__' ? 'later' : 'saved')
            setModel(value === '__later__' ? '' : value)
            setStage('confirm')
          }
        }} onCancel={()=>setStage('workflow')}/>}
      {!busy && stage === 'provider' && <Select options={getGithubActionsProviderOptions()}
        onChange={value=>{
          setProvider(value)
          setStage('model-name')
        }} onCancel={()=>setStage('models')}/>}
      {!busy && stage === 'model-name' && <Box flexDirection="column" gap={1}>
        <Text>请输入 {provider} 在 API 中使用的准确模型 ID：</Text>
        <TextInput value={newModel} onChange={setNewModel} focus={true}
          columns={Math.max(24,terminal.columns-12)} cursorOffset={nameCursor} onChangeCursorOffset={setNameCursor}
          onSubmit={value=>{
            if (!/^[A-Za-z0-9_./:-]{1,180}$/.test(value)) {
              setStatus('模型 ID 格式无效，请输入服务商的真实模型 ID。')
              return
            }
            setNewModel(value)
            setStage('api-key')
          }} placeholder="例如 gpt-6 或 deepseek-chat" />
      </Box>}
      {!busy && stage === 'api-key' && <Box flexDirection="column" gap={1}>
        <Text>请输入 {provider}/{newModel} 的 API Key，回显已隐藏：</Text>
        <TextInput value={apiKey} onChange={setApiKey} focus={true} mask="*"
          columns={Math.max(24,terminal.columns-12)} cursorOffset={keyCursor} onChangeCursorOffset={setKeyCursor}
          onSubmit={value=>{
            if(value.length<5 || value.length>8192 || value.trim()!==value) {
              setStatus('API Key 格式无效，请检查粘贴内容。')
              return
            }
            setApiKey(value)
            setStage('confirm')
          }} placeholder="输入或粘贴 API Key" />
      </Box>}
      {!busy && stage === 'confirm' && <Box flexDirection="column" gap={1}>
        <Text>仓库：{repo}　工作流：{workflow}</Text>
        <Text>模型：{entry === 'new' ? `${provider}/${newModel}` : (entry === 'existing' ? '验证并复用仓库已有 Actions 配置' : model || '稍后配置')}</Text>
        <Text dimColor>确认上传只将所选 API Key 发送到当前仓库的 GitHub Actions Secret，本地 OAuth 凭据保持独立。</Text>
        <Select options={[
          ...(model || entry === 'new'
            ? [{label:entry === 'new'?'确认安装并上传新 API Key':'确认安装并上传已保存的 API Key',value:'upload'}]
            : []),
          ...(entry === 'existing' ? [{label:'验证并复用仓库已有 Actions 配置',value:'reuse'}] : []),
          {label:'仅安装工作流，稍后配置 Actions 密钥',value:'install'},
          {label:'返回修改',value:'back'},
        ]} onChange={value=>{
          if (value === 'back') setStage('models')
          else void perform(value === 'upload', value === 'reuse')
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
