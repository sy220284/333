import * as React from 'react'
import { Box, Text, useInput } from '../../ink.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import type { PermissionRequestProps } from '../../components/permissions/PermissionRequest.js'
/** Review the actual code before allowing a Workflow to spawn agents. */
export function WorkflowPermissionRequest({toolUseConfirm,onDone,onReject}:PermissionRequestProps):React.ReactNode{
 const input=toolUseConfirm.input as Record<string,unknown>
 const message=typeof toolUseConfirm.description==='string'?toolUseConfirm.description:''
 const injected=message.startsWith('Review dynamic workflow before running: ')?
   message.slice(message.indexOf('\n\n')+2):undefined
 const script=typeof input.script==='string'?input.script:injected
 const reject=()=>{toolUseConfirm.onReject();onReject();onDone()}
 const approve=()=>{
   if(!script?.trim())return
   toolUseConfirm.onAllow({
     script,
     ...(input.args!==undefined?{args:input.args}:{}),
     ...(typeof input.resumeFromRunId==='string'?{resumeFromRunId:input.resumeFromRunId}:{}),
   },[])
   onDone()
 }
 useInput((value,key)=>{
   if(value==='y'&&script?.trim())approve()
   else if(value==='n'||key.escape)reject()
 })
 return <Dialog title="Approve Workflow script" subtitle="This workflow may launch multiple agents" onCancel={reject} color="permission">
   <Box flexDirection="column" gap={1}>
     <Text bold>Review the entire script and approve this run only.</Text>
     {script?<Text wrap="wrap">{script}</Text>:<Text color="error">No approved script is available; reject this request.</Text>}
     <Text dimColor>y · Approve once     n/Esc · Reject</Text>
   </Box>
 </Dialog>
}
