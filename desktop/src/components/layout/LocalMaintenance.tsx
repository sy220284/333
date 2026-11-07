import { useState } from 'react'
import { DatabaseBackup, Eraser, FolderOpen, PackageCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { desktopHost } from '../../lib/desktopHost'

type Report = Record<string, any>

function Size({ bytes }: { bytes?: number }) {
  if (!bytes) return <span>0 B</span>
  if (bytes < 1024 * 1024) return <span>{(bytes / 1024).toFixed(1)} KB</span>
  return <span>{(bytes / 1024 / 1024).toFixed(1)} MB</span>
}

export function LocalMaintenance({ workspace, token, onError, onChanged }: { workspace: string; token: string; onError: (text: string) => void; onChanged: () => void }) {
  const [diagnosis, setDiagnosis] = useState<Report | null>(null)
  const [preview, setPreview] = useState<Report | null>(null)
  const [result, setResult] = useState<Report | null>(null)
  const [busy, setBusy] = useState<'diagnose' | 'preview' | 'purge' | ''>('')
  const [confirm, setConfirm] = useState(false)
  const [ageDays, setAgeDays] = useState('30')
  const [largest, setLargest] = useState('200')
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await desktopHost.rpc(method, { workspace, token, ...params }, { timeoutMs: 60000 })
    return response as Report
  }
  const diagnose = async () => {
    setBusy('diagnose'); setErrorClear()
    try { setDiagnosis(await call('maintenance.diagnose')) } catch (error) { onError(error instanceof Error ? error.message : String(error)) } finally { setBusy('') }
  }
  const setErrorClear = () => setResult(null)
  const previewPurge = async () => {
    setBusy('preview'); setResult(null)
    try { setPreview(await call('maintenance.purge', { dryRun: true, ageDays: Number(ageDays) || 0, largestMB: Number(largest) || 0 })) } catch (error) { onError(error instanceof Error ? error.message : String(error)) } finally { setBusy('') }
  }
  const purge = async () => {
    setBusy('purge'); setResult(null)
    try {
      const report = await call('maintenance.purge', { dryRun: false, ageDays: Number(ageDays) || 0, largestMB: Number(largest) || 0 })
      setResult(report); setConfirm(false); setPreview(null); onChanged()
    } catch (error) { onError(error instanceof Error ? error.message : String(error)) } finally { setBusy('') }
  }
  const retention = diagnosis?.retention || {}
  const database = diagnosis?.database || {}
  const plans = preview?.plans || []
  const reclaimed = result?.reclaimedBytes || 0
  return <Card className="yy-maintenance-card" title="本地数据维护" description="只处理已确认的本地缓存、临时文件、日志、旧数据库和更新安装包，不动项目源码。">
    <div className="yy-inline-actions"><Button size="sm" variant="secondary" icon={<DatabaseBackup size={14} />} loading={busy === 'diagnose'} onClick={diagnose}>诊断本地数据</Button><Button size="sm" variant="secondary" icon={<FolderOpen size={14} />} onClick={() => call('workspace.diagnose', { includeInventory: false }).then(report => { const directory = String(report.directory || workspace); return desktopHost.rpc('workspace.open', { workspace, directory, token }) }).catch(error => onError(error instanceof Error ? error.message : String(error)))}>打开工作目录</Button></div>
    {diagnosis && <div className="yy-maintenance-diagnosis yy-reveal"><div><span>数据库完整性</span><strong>{String(database.integrity || '未检查')}</strong></div><div><span>数据库大小</span><strong><Size bytes={Number(database.sizeBytes || 0)} /></strong></div><div><span>临时文件</span><strong><Size bytes={retention.temp?.sizeBytes} /></strong></div><div><span>日志</span><strong><Size bytes={retention.logs?.sizeBytes} /></strong></div><div><span>更新缓存</span><strong><Size bytes={retention.updates?.sizeBytes} /></strong></div><div><span>缓存</span><strong><Size bytes={retention.cache?.sizeBytes} /></strong></div><p>{diagnosis.protected?.length ? `受保护项目：${diagnosis.protected.length} 项；清理不会触碰源码、当前数据库和保留日志。` : '没有可清理的本地数据。'}</p></div>}
    <div className="yy-maintenance-controls"><label>日志保留天数<Input type="number" min="0" value={ageDays} onChange={event => setAgeDays(event.target.value)} /></label><label>大型安装包阈值（MB）<Input type="number" min="0" value={largest} onChange={event => setLargest(event.target.value)} /></label><Button size="sm" variant="secondary" icon={<Eraser size={14} />} loading={busy === 'preview'} onClick={previewPurge}>预览清理</Button></div>
    {preview && <div className="yy-maintenance-preview yy-reveal"><strong>预计可释放 <Size bytes={Number(preview.reclaimableBytes || 0)} /></strong>{plans.length === 0 ? <p>没有符合策略的清理项。</p> : <ul>{plans.map((plan: Report, index: number) => <li key={`${String(plan.category)}-${index}`}><span>{String(plan.category)}</span><span>{Number(plan.fileCount || 0)} 个文件</span><Size bytes={Number(plan.sizeBytes || 0)} /></li>)}</ul>}<div className="yy-maintenance-protected"><PackageCheck size={14} />源码、当前数据库、最近日志和受保护项目不会删除。</div>{!confirm ? <Button size="sm" variant="danger" disabled={!plans.length} onClick={() => setConfirm(true)}>确认清理范围</Button> : <div className="yy-danger-actions"><span>此操作只删除上面列出的可再生成文件，不能撤销。</span><Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>取消</Button><Button size="sm" variant="danger" loading={busy === 'purge'} onClick={purge}>执行本地清理</Button></div>}</div>}
    {result && <p className="yy-success yy-reveal">本地清理完成，释放 <Size bytes={Number(reclaimed)} />；失败 {Number(result.failed || 0)} 项，保留 {Number(result.retained || 0)} 项。</p>}
  </Card>
}
