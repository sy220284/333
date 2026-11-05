import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { basename } from 'node:path'
import { getSessionId } from '../../bootstrap/state.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { LoadingState } from '../../components/design-system/LoadingState.js'
import TextInput from '../../components/TextInput.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { Box, Text } from '../../ink.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalJSXCommandContext,LocalJSXCommandOnDone } from '../../types/command.js'
import { prepareApiRequest } from '../../utils/teleport/api.js'
import { createProjectsClient317,ProjectApiError317,
  type Project317 } from './projectApi317.js'

type Context=ToolUseContext&LocalJSXCommandContext
type Step='loading'|'choose'|'name'|'mode'|'compose'|'confirm'|'sending'
type Client=ReturnType<typeof createProjectsClient317>
type Outcome={project:Project317;created:boolean;messageSent:boolean;
  memorySaved:boolean;setupSubmitted:boolean;handoff:boolean;notes:string[]}
function fitBytes(input:string,max=1024):string{
  let s=input.trim()
  while(Buffer.byteLength(s,'utf8')>max)s=s.slice(0,-1)
  return s
}
/** Only user-authored text is previewed; tool outputs are not transmitted. */
export function buildProjectBrief317(context:Context):string{
  const session=getSessionId()
  const messages=context.messages as unknown[]
  const prompts:string[]=[]
  for(const item of messages){
    if(!item||typeof item!=='object')continue
    const v=item as Record<string,unknown>
    if(v.type!=='user')continue
    const m=v.message
    if(!m||typeof m!=='object')continue
    const content=(m as Record<string,unknown>).content
    const blocks=typeof content==='string'?[{type:'text',text:content}]:
      Array.isArray(content)?content:[]
    const text=blocks.filter(b=>b&&typeof b==='object'&&b.type==='text'&&
      typeof b.text==='string').map(b=>b.text as string).join(' ').trim()
    if(text)prompts.push(text.slice(0,220))
  }
  return fitBytes(['Claude Code 会话交接','目录: '+basename(process.cwd()),
    '会话: '+session,'最近用户任务:',
    ...(prompts.length?prompts.slice(-3).map(x=>'- '+x):['- 本次会话无可读的用户消息']),
  ].join('\n'))
}

function SendToProject({onDone,context,args}:{
  onDone:LocalJSXCommandOnDone;context:Context;args:string
}):React.ReactNode{
  const [step,setStep]=useState<Step>('loading')
  const [projects,setProjects]=useState<Project317[]>([])
  const [chosen,setChosen]=useState<Project317|null>(null)
  const [newName,setNewName]=useState('')
  const [nameCursor,setNameCursor]=useState(0)
  const [messageCursor,setMessageCursor]=useState(0)
  const [message,setMessage]=useState(fitBytes(args))
  const [isBrief,setBrief]=useState(false)
  const [error,setError]=useState('')
  const [client,setClient]=useState<Client|null>(null)
  const started=useRef(false)
  const sending=useRef(false)
  useEffect(()=>{
    if(started.current)return
    started.current=true
    const controller=new AbortController()
    void (async()=>{
      try{
        if(!context.getAppState().replBridgeSessionId){
          onDone('当前会话尚未连接 Remote Control。请先运行 /remote-control 建立可读取的会话，再使用 /send-to-project；本次没有创建或发送任何内容。',{display:'system'})
          return
        }
        const {accessToken,orgUUID}=await prepareApiRequest()
        const api=createProjectsClient317({baseUrl:getOauthConfig().BASE_API_URL,
          accessToken,organizationUuid:orgUUID})
        const available=await api.list(controller.signal)
        setClient(api)
        setProjects(available.filter(p=>p.visibility==='private'&&!p.closed))
        setStep('choose')
      }catch(e){
        if(!controller.signal.aborted)onDone('无法读取 Claude Projects：'+
          (e instanceof Error?e.message:String(e)),{display:'system'})
      }
    })()
    return ()=>controller.abort()
  },[onDone])
  const cancel=()=>onDone('已取消发送；未向项目提交内容。',{display:'system'})
  const choose=(id:string)=>{
    if(id==='create'){setChosen(null);setStep('name');return}
    const project=projects.find(p=>p.id===id)
    if(!project){setError('项目选择已失效，请重新选择。');return}
    setChosen(project)
    setStep(args.trim()?'confirm':'mode')
  }
  const pickMode=(value:string)=>{
    if(value==='brief'){
      setBrief(true);setMessage(buildProjectBrief317(context));setStep('confirm')
    }else{
      setBrief(false);setMessage('');setStep('compose')
    }
  }
  const doSend=async()=>{
    if(sending.current||!client)return
    if(!message.trim()||Buffer.byteLength(message,'utf8')>1024){
      setError('消息必须为非空，最多1024字节。')
      return
    }
    if(!chosen && !newName.trim()){setError('请填写项目名称');return}
    sending.current=true
    setError('')
    setStep('sending')
    let created:Project317|null=null
    try{
      // A handoff is valid only while this same Remote Control session owns it.
      if(!context.getAppState().replBridgeSessionId)
        throw new Error('Remote Control 会话已断开，未创建或发送任何内容')
      // The explicit confirmation above is the only entry to mutable calls.
      const project=chosen?await client.getOwned(chosen.id):
        await client.create(newName)
      if(!chosen)created=project
      // A newly created project may not yet be visible to GET; the creation
      // response itself is authoritative. Existing projects must pass owner check.
      const notes:string[]=[]
      let memorySaved=false
      let setupSubmitted=false
      let handoff=false
      let messageSent=false
      if(isBrief){
        const path='/PROJECT_BRIEF_CLAUDE_CODE.md'
        const memory=await client.memory(project.id,path,message)
        memorySaved=memory==='created'
        if(memory==='existing')notes.push('项目已有同名记忆，保留原文件。')
        const sourceSessionId=context.getAppState().replBridgeSessionId||null
        const submission=await client.submitSetup(project.id,{
          summary:message,
        },sourceSessionId)
        if(submission.kind==='submitted'){
          setupSubmitted=true
          if(submission.dropped.length)notes.push('服务端省略了部分交接内容：'+
            submission.dropped.join(', '))
        }else{
          notes.push('项目设置卡未提交（'+submission.reason+'），改为发送摘要消息。')
        }
        if(!setupSubmitted&&project.coordinatorSessionId){
          await client.handoff(project.coordinatorSessionId,message)
          handoff=true
        }
        if(!setupSubmitted&&!handoff){
          await client.send(project.id,message,client.createMessageId())
          messageSent=true
        }
      }else{
        await client.send(project.id,message,client.createMessageId())
        messageSent=true
      }
      const outcome:Outcome={project,created:!!created,messageSent,memorySaved,
        setupSubmitted,handoff,notes}
      const link=getOauthConfig().CLAUDE_AI_ORIGIN+'/code/project/'+
        encodeURIComponent(outcome.project.id)
      onDone([
        outcome.created?'已创建私人项目：'+outcome.project.name:
          '已提交到私人项目：'+outcome.project.name,
        outcome.setupSubmitted?'项目交接卡已提交。':
          outcome.handoff?'交接内容已发送给项目协调会话。':
            outcome.messageSent?'消息已发送并取得回执。':'',
        outcome.memorySaved?'会话摘要已保存到项目记忆。':'',
        ...outcome.notes,link,
      ].filter(Boolean).join('\n'),{display:'system'})
    }catch(e){
      const detail=e instanceof Error?e.message:String(e)
      const uncertain=e instanceof ProjectApiError317&&e.mayHaveLanded
      onDone((created?'项目已创建：'+created.name+'。':'')+
        (uncertain?'服务端可能已接收本次请求。请先打开项目核实，避免重复提交。':
          '发送失败：'+detail),{display:'system'})
    }finally{sending.current=false}
  }
  if(step==='loading'||step==='sending')
    return <LoadingState message={step==='loading'?'正在获取 Claude 私人项目…':
      '正在提交到 Claude Project…'}/>
  return <Dialog title="发送到 Claude Project" onCancel={cancel}
    isCancelActive={step!=='compose'&&step!=='name'}>
    <Box flexDirection="column" gap={1}>
      {error?<Text color="error">{error}</Text>:null}
      {step==='choose'?<>
        <Text>选择一个你拥有的私有项目，或创建新项目：</Text>
        <Select options={[...projects.map(p=>({label:p.name,value:p.id})),
          {label:'创建新的私人项目',value:'create'}]}
          onChange={choose} onCancel={cancel}/>
      </>:null}
      {step==='name'?<>
        <Text>输入新项目名称（仅创建你个人可见的私人项目）：</Text>
        <TextInput value={newName} onChange={setNewName} columns={70}
          cursorOffset={nameCursor} onChangeCursorOffset={setNameCursor}
          placeholder="项目名称" onSubmit={v=>{
            if(!v.trim()||Buffer.byteLength(v.trim())>200){
              setError('项目名称须为1–200字节');return
            }
            setError('');setStep(args.trim()?'confirm':'mode')
          }} onExit={cancel}/>
      </>:null}
      {step==='mode'?<>
        <Text>请选择发送内容：</Text>
        <Select options={[{label:'交接本地会话摘要（含最近用户任务）',value:'brief'},
          {label:'自行输入一条消息',value:'message'}]}
          onChange={pickMode} onCancel={cancel}/>
      </>:null}
      {step==='compose'?<>
        <Text>请输入消息（最多1024字节）：</Text>
        <TextInput value={message} onChange={setMessage} columns={70}
          cursorOffset={messageCursor} onChangeCursorOffset={setMessageCursor}
          multiline placeholder="发送到项目的消息" onSubmit={v=>{
            if(!v.trim()||Buffer.byteLength(v)>1024){
              setError('消息必须为非空，最多1024字节');return
            }
            setError('');setStep('confirm')
          }} onExit={cancel}/>
      </>:null}
      {step==='confirm'?<>
        <Text>项目：{chosen?.name??newName}</Text>
        <Text>以下内容会发送到 Claude 云端项目，请核对：</Text>
        <Text>{message}</Text>
        <Text dimColor>本地未提交的代码、密钥和工具输出不会随消息上传。</Text>
        <Select options={[{label:chosen?'确认发送':'创建私人项目并发送',value:'send'},
          {label:'取消',value:'cancel'}]}
          onChange={v=>{if(v==='send')void doSend();else cancel()}} onCancel={cancel}/>
      </>:null}
    </Box>
  </Dialog>
}
export async function call(onDone:LocalJSXCommandOnDone,
  context:Context,args:string):Promise<React.ReactNode>{
  if(args && Buffer.byteLength(args.trim(),'utf8')>1024){
    onDone('消息超过1024字节，请缩短后重新运行 /send-to-project。',{display:'system'})
    return null
  }
  return <SendToProject onDone={onDone} context={context} args={args}/>
}
