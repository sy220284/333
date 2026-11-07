import { useState } from 'react'
import { FileUp, ShieldCheck } from 'lucide-react'
import { api } from '../../api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

type Imported = { sourceName: string; name: string; type: string; collision: boolean }
type Preview = { token: string; source: string; servers: Imported[]; cancelled?: boolean }
type Outcome = { added: string[]; errors: string[]; cancelled?: boolean }

export function McpImportPanel({ onImported }: { onImported: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [scope, setScope] = useState<'project' | 'user' | 'local'>('project')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState<'pick' | 'apply' | ''>('')
  const [error, setError] = useState('')
  async function pick() {
    setBusy('pick'); setError(''); setPreview(null); setSelected([]); setOutcome(null)
    try {
      const data = await api.call<Preview>('mcp.import.pick')
      if (data.cancelled) return
      setPreview(data)
      setSelected(data.servers.filter(server => !server.collision).map(server => server.sourceName))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy('') }
  }
  async function apply() {
    if (!preview || !selected.length) return
    setBusy('apply'); setError('')
    try {
      const data = await api.call<Outcome>('mcp.import.apply', { token: preview.token, names: selected, scope })
      if (data.cancelled) return
      setOutcome(data); setPreview(null); setSelected([])
      if (data.added.length) onImported()
    } catch (e) { setPreview(null); setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy('') }
  }
  return <Card radius="lg" padding="lg" surface="lowest" shadow="card">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-[14px] font-semibold"><FileUp size={16}/>导入已有 MCP 配置</h3>
        <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">选择本地 JSON 文件，支持 Claude Desktop 等使用 mcpServers 格式的配置；预览后批量导入。</p></div>
      <Button variant="secondary" size="base" loading={busy === 'pick'} onClick={() => void pick()} disabled={Boolean(busy)}>{busy === 'pick' ? '选择中…' : '选择配置文件'}</Button>
    </div>
    {preview && <div className="yy-reveal mt-4 space-y-3">
      <p className="text-[12px]">来源：{preview.source} · {preview.servers.length} 个服务</p>
      <div className="max-h-60 space-y-1 overflow-auto">
        {preview.servers.map(server => <label key={server.sourceName} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-[12px]">
          <input type="checkbox" checked={selected.includes(server.sourceName)} onChange={e => setSelected(old => e.target.checked ? [...old, server.sourceName] : old.filter(name => name !== server.sourceName))}/>
          <span className="min-w-0 flex-1 break-all">{server.sourceName}{server.name !== server.sourceName ? ` → ${server.name}` : ''}</span>
          <span className="text-[var(--color-text-tertiary)]">{server.type}</span>
          {server.collision && <span className="text-[var(--color-text-secondary)]">同名将自动重命名</span>}
        </label>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[12px]">导入范围 <select value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
          <option value="project">当前项目</option><option value="user">用户级</option><option value="local">本地项目级</option>
        </select></label>
        <Button variant="primary" size="base" loading={busy === 'apply'} disabled={!selected.length || Boolean(busy)} onClick={() => void apply()}>
          <ShieldCheck size={14}/>{busy === 'apply' ? '正在导入…' : `导入选中的 ${selected.length} 个服务`}</Button>
      </div>
      <p className="text-[11px] text-[var(--color-text-tertiary)]">配置中的环境变量会随 MCP 服务原样保存在本地，不在预览界面显示；执行前还会再次确认。</p>
    </div>}
    {outcome && <div className="yy-reveal mt-4 text-[12px]" role="status">
      <p>成功导入：{outcome.added.length} 个{outcome.added.length ? ` · ${outcome.added.join('、')}` : ''}</p>
      {outcome.errors.map(message => <p key={message} className="mt-1 text-[var(--color-error)]">{message}</p>)}
    </div>}
    {error && <p role="alert" className="mt-3 text-[12px] text-[var(--color-error)]">{error}</p>}
  </Card>
}
