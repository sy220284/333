import { useState } from 'react'
import { AlertTriangle, Activity, HardDrive, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../../api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

type Diagnostic = {
  installation: {
    installationType: string; version: string; installationPath: string
    autoUpdates: string; warnings: Array<{ issue: string; fix: string }>
    multipleInstallations: Array<{ type: string; path: string }>
    ripgrepStatus: { working: boolean; mode: string }
  }
  runtime: { cwd: string; activeSessions: number; activeTasks: number }
  configuredProviders: string[]
  mcp: Array<{ scope: string; count: number; errors: string[] }>
  note: string
}
type PurgePreview = {
  token: string; workspace: string; activeSessions: number
  items: Array<{ path: string; kind: string; reason: string }>; warnings: string[]
}
type PurgeResult = { deleted?: number; total?: number; errors?: string[]; cancelled?: boolean }

export function LocalMaintenance({ workspace, connected, onPurged }: {
  workspace: string; connected: boolean; onPurged: () => void
}) {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [preview, setPreview] = useState<PurgePreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function diagnose() {
    setBusy('diagnose'); setError('')
    try { setDiagnostic(await api.call<Diagnostic>('system.diagnostics')) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy('') }
  }
  async function inspect() {
    setBusy('preview'); setError(''); setPreview(null); setConfirmed(false); setPurgeResult(null)
    try { setPreview(await api.call<PurgePreview>('data.purge.preview')) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy('') }
  }
  async function purge() {
    if (!preview || !confirmed) return
    setBusy('purge'); setError('')
    try {
      const result = await api.call<PurgeResult>('data.purge.apply', { token: preview.token })
      if (result.cancelled) return
      setPurgeResult(result); setPreview(null); setConfirmed(false)
      if ((result.deleted ?? 0) > 0) onPurged()
    } catch (e) {
      setPreview(null); setConfirmed(false)
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy('') }
  }
  return <div className="space-y-5">
    <section aria-label="系统诊断">
      <Card radius="lg" surface="lowest" shadow="card" padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="flex items-center gap-2 text-[14px] font-semibold"><Activity size={17}/>系统诊断</h3>
            <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">安装与搜索环境、多模型凭证、MCP 配置和本地会话状态。</p></div>
          <Button variant="secondary" size="base" disabled={!connected || Boolean(busy)} onClick={() => void diagnose()}>
            <RefreshCw size={14}/> {busy === 'diagnose' ? '检测中…' : '运行诊断'}</Button>
        </div>
        {diagnostic && <div className="mt-4 space-y-3 text-[12px]">
          <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] p-3">
              <strong>安装状态</strong><p className="mt-2 break-all">版本 {diagnostic.installation.version} · {diagnostic.installation.installationType}</p>
              <p className="mt-1 break-all text-[var(--color-text-secondary)]">{diagnostic.installation.installationPath}</p>
              <p>搜索工具：{diagnostic.installation.ripgrepStatus.working ? '正常' : '异常'} · {diagnostic.installation.ripgrepStatus.mode}</p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] p-3">
              <strong>执行与扩展</strong><p className="mt-2">已配置服务商：{diagnostic.configuredProviders.length}</p>
              <p>本地会话：{diagnostic.runtime.activeSessions} · 运行任务：{diagnostic.runtime.activeTasks}</p>
              <p>MCP 服务：{diagnostic.mcp.reduce((sum, row) => sum + row.count, 0)}</p>
            </div>
          </div>
          {diagnostic.installation.warnings.map(warning => <div key={`${warning.issue}:${warning.fix}`} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            <strong className="flex items-center gap-2"><AlertTriangle size={14}/> {warning.issue}</strong><p className="mt-1 text-[var(--color-text-secondary)]">{warning.fix}</p>
          </div>)}
          {diagnostic.mcp.flatMap(row => row.errors.map(message => `${row.scope}：${message}`)).map(message =>
            <p key={message} role="alert" className="text-[var(--color-error)]">{message}</p>)}
          {diagnostic.installation.warnings.length === 0 && diagnostic.mcp.every(row => !row.errors.length) &&
            <p className="flex items-center gap-2 text-[var(--color-text-secondary)]"><ShieldCheck size={15}/>当前检查未发现安装配置告警</p>}
          <p className="text-[11px] text-[var(--color-text-tertiary)]">{diagnostic.note}；检查结果不包含实网模型连通性测试。</p>
        </div>}
      </Card>
    </section>
    <section aria-label="本地数据清理">
      <Card radius="lg" surface="lowest" shadow="card" padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="flex items-center gap-2 text-[14px] font-semibold"><HardDrive size={17}/>本地数据管理</h3>
            <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">按当前工作区清理 AI 会话、任务和历史记录，保留项目源码及模型凭证。</p></div>
          <Button variant="secondary" size="base" disabled={!connected || Boolean(busy) || !workspace} onClick={() => void inspect()}>预览清理清单</Button>
        </div>
        <p className="mt-3 break-all text-[11px] text-[var(--color-text-tertiary)]">当前工作区：{workspace}</p>
        {preview && <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Badge size="sm" tone="warning">{preview.items.length} 项待清理</Badge>
            <span className="text-[11px] text-[var(--color-text-secondary)]">当前打开会话：{preview.activeSessions}。确认后会关闭空闲会话；执行中的任务请先停止。</span></div>
          {preview.warnings.map(warning => <p key={warning} role="alert" className="text-[12px] text-[var(--color-error)]">{warning}</p>)}
          <div className="max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            {preview.items.length ? preview.items.map(item => <div key={`${item.kind}:${item.path}`} className="border-b border-[var(--color-border)] py-2 last:border-b-0">
              <div className="break-all text-[11px] font-medium">{item.path}</div>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">{item.reason}</p>
            </div>) : <p className="text-[12px] text-[var(--color-text-secondary)]">当前工作区没有需要清理的记录。</p>}
          </div>
          {preview.items.length > 0 && <>
            <label className="flex items-start gap-2 text-[12px]"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
              <span>已核对删除清单，确认永久删除该工作区的本地 AI 记录。</span></label>
            <Button variant="danger-outline" size="base" disabled={!confirmed || Boolean(busy)} onClick={() => void purge()}>
              {busy === 'purge' ? '清理中…' : '确认清理所列记录'}</Button>
          </>}
        </div>}
        {purgeResult && <div className="mt-4 text-[12px]" role="status">
          <p>实际清理：{purgeResult.deleted}/{purgeResult.total} 项</p>
          {purgeResult.errors?.map(message => <p key={message} className="mt-1 break-all text-[var(--color-error)]">{message}</p>)}
          {purgeResult.errors?.length ? <Button size="sm" variant="secondary" onClick={() => void inspect()}>重新检查剩余记录</Button> : null}
        </div>}
      </Card>
    </section>
    {error && <p role="alert" className="text-[12px] text-[var(--color-error)]">{error}</p>}
  </div>
}
