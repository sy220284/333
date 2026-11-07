export type ConversationItem={id:string;kind:'user'|'assistant'|'tool'|'notice';text:string;time:number}
export function asObject(input:unknown):Record<string,unknown>|null {
  return input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:null
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
/** Replay-stable fallback for SDK events with no uuid/id. A history index
 * differentiates identical messages; live events use their payload fingerprint. */
function fallbackMessageId(message:Record<string,unknown>,index?:number):string {
  const serialized=JSON.stringify(message)
  let fingerprint=2166136261
  for(let i=0;i<serialized.length;i++) fingerprint=Math.imul(fingerprint^serialized.charCodeAt(i),16777619)
  return `sdk-${index===undefined?'live':index}-${(fingerprint>>>0).toString(16)}`
}
export function itemFromMessage(input:unknown,index?:number):ConversationItem|null {
  const message=asObject(input)
  if(!message)return null
  const nested=asObject(message.message)
  const role=String(nested?.role??message.role??message.type??'')
  const id=String(message.uuid??message.id??fallbackMessageId(message,index))
  const timestamp=message.timestamp??message.created_at
  const parsedTime=typeof timestamp==='number'?timestamp:typeof timestamp==='string'?Date.parse(timestamp):NaN
  const time=Number.isFinite(parsedTime)?parsedTime:Date.now()
  if(role==='assistant'||role==='user'){
    const text=textFromMessage(message)
    if(!text)return null
    return {id,kind:role,text,time}
  }
  if(role==='tool_progress'||role==='task_progress'){
    return {id,kind:'tool',text:String(message.tool_name??message.type??'工具执行'),time}
  }
  return null
}
export function statusName(phase:unknown):string {
  return ({running:'执行中',requires_action:'等待确认',completed:'已完成',cancelled:'已取消',failed:'执行失败',idle:'待命',closed:'已关闭'} as Record<string,string>)[String(phase)]??'待命'
}
