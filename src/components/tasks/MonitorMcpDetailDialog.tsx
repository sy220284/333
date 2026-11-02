import React from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import type { MonitorMcpTaskState } from '../../tasks/MonitorMcpTask/MonitorMcpTask.js'
import { Box, Text, useInput } from '../../ink.js'
import { Dialog } from '../design-system/Dialog.js'
type Props={
  task:DeepImmutable<MonitorMcpTaskState>
  onKill?:()=>void|Promise<void>
  onBack?:()=>void
}
export function MonitorMcpDetailDialog({task,onKill,onBack}:Props):React.ReactNode{
  useInput((input,key)=>{
    if(key.leftArrow)onBack?.()
    else if(input==='x'&&task.status==='running')void onKill?.()
  })
  return <Dialog title="Monitor · WebSocket" subtitle={task.status}
    onCancel={onBack??(()=>{})} color="background">
    <Box flexDirection="column" gap={1}>
      <Text>{task.description}</Text>
      <Text>Task: {task.id}</Text>
      <Text>URL: {task.url}</Text>
      <Text>Events received: {task.eventCount}</Text>
      <Text dimColor>← back · x stop monitoring</Text>
    </Box>
  </Dialog>
}
