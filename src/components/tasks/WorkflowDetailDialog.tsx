import React from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { Box, Text, useInput } from '../../ink.js'
import { Dialog } from '../design-system/Dialog.js'
type Props={
  workflow:DeepImmutable<LocalWorkflowTaskState>
  onDone:()=>void
  onKill?:()=>void|Promise<void>
  onSkipAgent?:(agentId:string)=>void
  onRetryAgent?:(agentId:string)=>void
  onBack?:()=>void
}
export function WorkflowDetailDialog({workflow,onDone,onKill,onSkipAgent,onRetryAgent,onBack}:Props):React.ReactNode{
  const agents=workflow.runningAgents??[]
  useInput((input,key)=>{
    if(key.leftArrow&&onBack){onBack();return}
    if(input==='x'&&workflow.status==='running')void onKill?.()
    if(input==='s'&&workflow.status==='running'&&agents[0])onSkipAgent?.(agents[0].agentId)
    if(input==='r'&&workflow.status==='running'&&agents[0])onRetryAgent?.(agents[0].agentId)
  })
  return <Dialog title={`Workflow · ${workflow.workflowName}`} subtitle={workflow.status}
    onCancel={onBack??onDone} color="background">
    <Box flexDirection="column" gap={1}>
      <Text>{workflow.summary}</Text>
      <Text>Run: {workflow.workflowRunId}  Task: {workflow.id}</Text>
      <Text>Current phase: {workflow.phase??'starting'}</Text>
      <Text>Script: {workflow.scriptPath??'inline'}</Text>
      <Text>Journal: {workflow.transcriptDir}/journal.jsonl</Text>
      {agents.length===0?<Text>No agent call currently active</Text>:
        agents.map(agent=><Text key={agent.agentId}>{agent.agentId}: {agent.description}</Text>)}
      <Text dimColor>← back · x stop workflow · s skip current agent · r retry current agent</Text>
    </Box>
  </Dialog>
}
