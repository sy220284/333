import { useState } from 'react'
import { FileInput, Import } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { desktopHost } from '../../lib/desktopHost'
import { presentError } from '../../lib/presentError'

export function McpImportPanel({ workspace, token, projectPath, onImported, onError }: { workspace: string; token: string; projectPath: string; onImported: () => Promise<void>; onError: (message: string) => void }) {
  const [source, setSource] = useState('')
  const [scope, setScope] = useState('project')
  const [conflict, setConflict] = useState('rename')
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState<'pick' | 'apply' | ''>('')
  const [result, setResult] = useState('')
  const pick = async () => {
    setBusy('pick'); setError('')
    try {
      const response = await desktopHost.rpc('mcp.import.pick', { token, projectPath: projectPath || undefined }, { timeoutMs: 120000 }) as any
      if (response.cancelled) return
      setSource(response.source || '')
      setPreview(response)
    } catch (error) { setError(presentError(error)) } finally { setBusy('') }
  }
  const setError = (message: string) => { setResult(''); if (message) onError(message) }
  const apply = async () => {
    if (!source) return
    setBusy('apply'); setError('')
    try {
      const response = await desktopHost.rpc('mcp.import.apply', { workspace, token, source, projectPath: projectPath || undefined, scope, conflict }, { timeoutMs: 30000 }) as any
      setResult(`已导入 ${response.imported || 0} 项，跳过 ${response.skipped || 0} 项${response.errors?.length ? `，${response.errors.length} 项失败` : ''}`)
      await onImported()
    } catch (error) { setError(presentError(error)) } finally { setBusy('') }
  }
  return <Card className="yy-mcp-import" title="从本机导入 MCP" description="识别本机其他工具或 JSON 文件中的 MCP 配置；凭证只保存在本机，不回显密钥。">
    <div className="yy-inline-actions"><Button size="sm" variant="secondary" icon={<FileInput size={14} />} loading={busy === 'pick'} onClick={pick}>选择本机配置或 JSON 文件</Button>{source && <span className="yy-mcp-source" title={source}>{source}</span>}</div>
    {preview && <div className="yy-mcp-import-preview yy-reveal"><strong>{preview.detected?.name || '配置文件'}</strong><span>可用 {preview.availableCount || 0} · 同名 {preview.conflicts?.length || 0} · 缺少命令 {preview.invalidCount || 0}</span>{preview.invalid?.length > 0 && <small>缺少 command 的服务不会导入；请在原工具中补齐启动命令。</small>}</div>}
    {source && <div className="yy-mcp-import-controls"><label>导入范围<select value={scope} onChange={event => setScope(event.target.value)}><option value="project">当前项目</option><option value="user">用户共享</option></select></label><label>同名处理<select value={conflict} onChange={event => setConflict(event.target.value)}><option value="rename">自动改名</option><option value="skip">跳过同名</option></select></label><Button size="sm" icon={<Import size={14} />} loading={busy === 'apply'} onClick={apply}>导入配置</Button></div>}
    {result && <p className="yy-success yy-reveal">{result}</p>}
  </Card>
}
