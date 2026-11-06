import * as React from 'react'
import { useEffect, useState } from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { ContextVisualization } from '../../components/ContextVisualization.js'
import { Status, buildDiagnostics } from '../../components/Settings/Status.js'
import { Usage } from '../../components/Settings/Usage.js'
import { Stats } from '../../components/Stats.js'
import { Pane } from '../../components/design-system/Pane.js'
import { Tab, Tabs } from '../../components/design-system/Tabs.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { formatTotalCost } from '../../cost-tracker.js'
import type { ContextData } from '../../utils/analyzeContext.js'
import { collectContextData } from '../context/context-noninteractive.js'

type Props = { onClose: LocalJSXCommandOnDone; context: LocalJSXCommandContext }

function ContextTab({ context, active }: { context: LocalJSXCommandContext; active: boolean }): React.ReactNode {
  const [data, setData] = useState<ContextData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    let disposed = false
    setError(null)
    void collectContextData(context).then(result => {
      if (!disposed) setData(result)
    }).catch(err => {
      if (!disposed) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { disposed = true }
  }, [active, context])
  if (error) return <Text color="error">上下文读取失败：{error}</Text>
  if (!data) return <Text dimColor>正在计算上下文用量…</Text>
  return <ContextVisualization data={data} />
}

/** 统一状态面板，在内存中查询现有统计能力。 */
export function RuntimeStatusPanel({ onClose, context }: Props): React.ReactNode {
  const [selectedTab, setSelectedTab] = useState('overview')
  const [diagnosticsPromise] = useState(() => buildDiagnostics())
  const { rows } = useTerminalSize()
  useExitOnCtrlCDWithKeybindings()
  useKeybinding('confirm:no', () => onClose('已关闭运行状态面板', { display: 'system' }), {
    context: 'Settings', isActive: true,
  })
  return (
    <Pane color="permission">
      <Tabs title="333 运行状态" color="permission" selectedTab={selectedTab}
        onTabChange={setSelectedTab} contentHeight={Math.max(15, Math.min(Math.floor(rows * 0.8), 30))}>
        <Tab id="overview" title="概览">
          <Status context={context} diagnosticsPromise={diagnosticsPromise} />
        </Tab>
        <Tab id="usage" title="模型用量">
          <Usage context={context} />
        </Tab>
        <Tab id="context" title="上下文">
          <ContextTab context={context} active={selectedTab === 'context'} />
        </Tab>
        <Tab id="cost" title="费用">
          <Box flexDirection="column"><Text bold>当前会话费用与活动</Text><Text>{formatTotalCost()}</Text></Box>
        </Tab>
        <Tab id="stats" title="历史统计">
          <Stats onClose={onClose} />
        </Tab>
      </Tabs>
    </Pane>
  )
}
