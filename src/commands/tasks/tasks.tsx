import * as React from 'react'
import { useState } from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { BackgroundTasksDialog } from '../../components/tasks/BackgroundTasksDialog.js'
import { WorkflowHistoryDialog } from '../../components/tasks/WorkflowHistoryDialog.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

type View = 'menu' | 'active' | 'workflows'
function TaskHub({ onDone, context, initial }: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
  initial: View
}): React.ReactNode {
  const [view, setView] = useState<View>(initial)
  if (view === 'active') {
    return <BackgroundTasksDialog toolUseContext={context} onDone={() => setView('menu')} />
  }
  if (view === 'workflows') {
    return <WorkflowHistoryDialog toolUseContext={context} onDone={() => setView('menu')} />
  }
  return (
    <Dialog title="333 任务管理" onCancel={() => onDone()}>
      <Box flexDirection="column" gap={1}>
        <Text>选择需要管理的任务类型：</Text>
        <Select<View>
          options={[
            { label: '后台任务', value: 'active', description: '进程、Agent、远程任务及停止与恢复' },
            { label: '工作流与历史', value: 'workflows', description: '工作流执行记录、结果及活动任务' },
          ]}
          onChange={setView}
          onCancel={() => onDone()}
        />
      </Box>
    </Dialog>
  )
}
export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const value = args.trim().toLowerCase()
  const initial: View = value === 'history' || value === 'workflows'
    ? 'workflows'
    : value === 'active'
      ? 'active'
      : 'menu'
  return <TaskHub onDone={onDone} context={context} initial={initial} />
}
