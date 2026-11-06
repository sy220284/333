export type ConversationItem={id:string;kind:'user'|'assistant'|'tool'|'notice';text:string;time:number}
export function asObject(input:unknown):Record<string,any>|null {
  return input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,any>:null
}
export function textFromMessage(input:unknown):string {
  if(typeof input==='string')return input
  const message=asObject(input)
  if(!message)return ''
  const content=message.content??message.message?.content
  if(typeof content==='string')return content
  if(Array.isArray(content))return content.filter(part=>part?.type==='text'&&typeof part.text==='string').map(part=>part.text).join('\n')
  return typeof message.text==='string'?message.text:''
}
export function itemFromMessage(input:unknown):ConversationItem|null {
  const message=asObject(input)
  if(!message)return null
  const nested=asObject(message.message)
  const role=String(nested?.role??message.role??message.type??'')
  if(role==='assistant'||role==='user'){
    const text=textFromMessage(message)
    if(!text)return null
    return {id:String(message.uuid??message.id??Math.random()),kind:role,text,time:Date.now()}
  }
  if(role==='tool_progress'||role==='task_progress'){
    return {id:String(message.uuid??Math.random()),kind:'tool',text:String(message.tool_name??message.type??'工具执行'),time:Date.now()}
  }
  return null
}
export function statusName(phase:unknown):string {
  return ({running:'执行中',requires_action:'等待确认',completed:'已完成',cancelled:'已取消',failed:'执行失败',idle:'待命',closed:'已关闭'} as Record<string,string>)[String(phase)]??'待命'
}
