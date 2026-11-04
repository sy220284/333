import * as React from 'react'
import { useCallback,useEffect,useState } from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { Box,Text,useInput } from '../../ink.js'
import { Dialog } from '../design-system/Dialog.js'
import { BackgroundTasksDialog } from './BackgroundTasksDialog.js'
import { getSessionId,getSessionProjectDir,getOriginalCwd } from '../../bootstrap/state.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { readWorkflowHistory } from '../../tasks/LocalWorkflowTask/workflowHistory.ts'
type Summary={runId:string,workflowName?:string,summary?:string,status?:string,startTime?:number,
 result?:unknown,scriptPath?:string,workflowProgress?:Array<{title:string}>,
 agentCount?:number,durationMs?:number,error?:string}
export function WorkflowHistoryDialog({onDone,toolUseContext}:{
 onDone:LocalJSXCommandOnDone,toolUseContext:LocalJSXCommandContext,
}):React.ReactNode{
 const [records,setRecords]=useState<Summary[]>([])
 const [errors,setErrors]=useState<string[]>([])
 const [selected,setSelected]=useState(0)
 const [expanded,setExpanded]=useState(false)
 const [showActive,setShowActive]=useState(false)
 const [loading,setLoading]=useState(true)
 const refresh=useCallback(()=>{
  const project=getSessionProjectDir()??getProjectDir(getOriginalCwd())
  setLoading(true)
  void readWorkflowHistory(project,getSessionId()).then(data=>{
   setRecords(data.runs)
   setErrors(data.errors.map(e=>`${e.file}: ${e.message}`))
   setSelected(index=>Math.max(0,Math.min(index,data.runs.length-1)))
   setLoading(false)
  }).catch(error=>{
   setErrors([String(error)])
   setLoading(false)
  })
 },[])
 useEffect(()=>{refresh()},[refresh])
 useInput((input,key)=>{
  if(showActive)return
  if(key.escape){
   if(expanded)setExpanded(false)
   else onDone()
   return
  }
  if(input==='a'){setShowActive(true);return}
  if(input==='r'){refresh();return}
  if(expanded)return
  if(key.upArrow)setSelected(i=>Math.max(0,i-1))
  if(key.downArrow)setSelected(i=>Math.max(0,Math.min(records.length-1,i+1)))
  if(key.return&&records.length)setExpanded(true)
 })
 if(showActive)return <BackgroundTasksDialog onlyWorkflows toolUseContext={toolUseContext} onDone={()=>setShowActive(false)}/>
 const record=records[selected]
 return <Dialog title="Workflow runs" subtitle="Saved results for this session" color="background" onCancel={()=>expanded?setExpanded(false):onDone()}>
  <Box flexDirection="column" gap={1}>
   {loading&&<Text>Loading workflow history…</Text>}
   {!loading&&records.length===0&&<Text>No saved workflows in this session</Text>}
   {!expanded&&records.map((item,index)=><Text key={item.runId} color={index===selected?'text':'secondaryText'}>
    {index===selected?'› ':'  '}{item.workflowName??'Workflow'} · {item.status??'unknown'} · {item.runId}
   </Text>)}
   {expanded&&record&&<Box flexDirection="column">
    <Text bold>{record.workflowName??'Workflow'} · {record.status??'unknown'}</Text>
    <Text>{record.summary??''}</Text>
    <Text>Run: {record.runId}</Text>
    <Text>Steps: {(record.workflowProgress??[]).map(p=>p.title).join(' → ')||'—'}</Text>
    <Text>Agent calls: {record.agentCount??0} · Duration: {record.durationMs??0}ms</Text>
    {record.scriptPath&&<Text>Script: {record.scriptPath}</Text>}
    {record.status==='completed'&&<Text>Result: {JSON.stringify(record.result??null)?.slice(0,8000)}</Text>}
    {record.error&&<Text color="error">Error: {record.error}</Text>}
   </Box>}
   {errors.length>0&&<Text color="error">Unreadable run records: {errors.length} ({errors[0]})</Text>}
   <Text dimColor>{expanded?'Esc: back · a: active tasks · r: reload':
    '↑/↓: select · Enter: details · a: active tasks · r: reload · Esc: exit'}</Text>
  </Box>
 </Dialog>
}
