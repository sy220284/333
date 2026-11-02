import * as React from 'react'
import { Box, Text, useInput } from '../../../ink.js'
import { Dialog } from '../../design-system/Dialog.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
export function MonitorPermissionRequest({toolUseConfirm,onDone,onReject}:PermissionRequestProps):React.ReactNode{
 const input=toolUseConfirm.input as Record<string,unknown>
 const command=typeof input.command==='string'?input.command:undefined
 const ws=input.ws&&typeof input.ws==='object'?input.ws as {url?:string}:undefined
 const target=command??ws?.url
 const reject=()=>{toolUseConfirm.onReject();onReject();onDone()}
 const approve=()=>{
   if(!target)return
   toolUseConfirm.onAllow(toolUseConfirm.input,[])
   onDone()
 }
 useInput((value,key)=>{if(value==='y'&&target)approve();else if(value==='n'||key.escape)reject()})
 return <Dialog title="Approve Monitor" subtitle="Background monitoring and notifications" onCancel={reject} color="permission">
   <Box flexDirection="column" gap={1}>
     <Text bold>{command?'Shell command':'WebSocket destination'}:</Text>
     {target?<Text wrap="wrap">{target}</Text>:<Text color="error">No monitor source specified.</Text>}
     <Text>Maximum runtime: {String(input.timeout_ms??300000)}ms (600000ms effective cap)</Text>
     <Text dimColor>y · Approve once     n/Esc · Reject</Text>
   </Box>
 </Dialog>
}
