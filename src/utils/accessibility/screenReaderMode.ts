/** 2.1.310: explicit CLI switch, environment and trusted settings only.
 * Project/local settings can request a warning but cannot enable this mode.
 * The caller supplies settings by source; no merged untrusted settings are read.
 */
const ANSI_CONTROL_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
export function resolveScreenReaderMode({
  argv=[],env={},trustedSettings=[],
}: {argv?: string[]; env?: Record<string, string | undefined>;
  trustedSettings?: Array<{settings?: {axScreenReader?: boolean}}> } = {}) : { enabled: boolean; source: string; } | { enabled: boolean; source?: undefined; } {
  if (argv.includes('--ax-screen-reader')) return {enabled:true,source:'flag'}
  if (Object.hasOwn(env,'CLAUDE_AX_SCREEN_READER')) {
    const value=env.CLAUDE_AX_SCREEN_READER
    return {enabled:Boolean(value),source:'env'}
  }
  for(const source of trustedSettings) {
    if(source?.settings?.axScreenReader === true) return {enabled:true,source:'settings'}
    if(source?.settings?.axScreenReader === false) return {enabled:false,source:'settings'}
  }
  return {enabled:false}
}
export function screenReaderChildEnvironment(mode) : { CLAUDE_AX_SCREEN_READER: string; } | { CLAUDE_AX_SCREEN_READER?: undefined; } {
  return mode.enabled ? {CLAUDE_AX_SCREEN_READER:'1'} : {}
}
/** Plain accessibility text is rendered without the terminal diff/animation
 * engine. This traversal preserves user text but excludes decorative frames.
 */
export function flattenAccessibleTree(root) : string {
  const blocks=[]
  let segment=''
  const flush=()=>{
    if(segment.trim()) blocks.push(segment)
    segment=''
  }
  const walk=node=>{
    if(!node||node.isHidden||node.attributes?.display==='none') return
    if(node.nodeName==='#text') {
      segment+=String(node.nodeValue??'')
      return
    }
    if(node.nodeName==='ink-raw-ansi') return
    const block=node.nodeName==='ink-box' || node.nodeName==='ink-root'
    // Ink also uses virtual text containers for grouped UI elements. Their
    // sibling Text nodes carry independent labels and must be spoken on
    // separate lines; nested Text inside a Text stays inline.
    const separatesTextSiblings=block || node.nodeName==='ink-virtual-text'
    if(block) flush()
    // Adjacent Ink <Text> children form separate semantic lines even when
    // layout renders them within the same Box. Nested inline Text keeps its
    // text contiguous (Claude Code v2.1.310, model and workspace are distinct).
    let previousText=false
    for(const child of node.childNodes??[]) {
      const nextText=child?.nodeName==='ink-text'
      if(separatesTextSiblings && previousText && nextText) flush()
      walk(child)
      previousText=nextText
    }
    if(block) flush()
  }
  walk(root)
  return blocks.join('\n').replace(ANSI_CONTROL_SEQUENCE,'')
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
}
export function accessibleOutputDelta(previous: string='',current: string='') : string {
  if(current===previous) return ''
  if(!current) return ''
  if(!previous) return `${current}\n`
  if(current.startsWith(previous)) return `${current.slice(previous.length)}\n`
  const oldLines=previous.split('\n'),lines=current.split('\n')
  let common=0
  while(common<oldLines.length && common<lines.length && oldLines[common]===lines[common]) common++
  if (common===oldLines.length-1 && lines.length===oldLines.length &&
      lines[common].startsWith(oldLines[common])) {
    return `${lines[common].slice(oldLines[common].length)}\n`
  }
  // On edits, announce only the changed tail; never erase the terminal
  // transcript with escape sequences (screen readers need persistent text).
  const changed=lines.slice(common).join('\n').trim()
  return changed ? `${changed}\n` : ''
}

/** Bounded announcement queue aligned with the official 2.1.310 startup
 * quiet (3s), hold (1s) and maximum of 16 announcements. A monotonic
 * caller-supplied clock lets tests exercise timing without sleeping.
 */
export function createScreenReaderAnnouncementQueue({quietMs=3000,holdMs=1000,max=16}: { quietMs?: number; holdMs?: number; max?: number; }={}) {
  let openedAt=null
  let quietEnded=false
  let heldUntil=0
  let queued=[]
  const remaining=(now=Date.now())=>{
    if(!queued.length)return 0
    const quietRemaining=quietEnded||openedAt===null?0:
      Math.max(0,openedAt+Math.min(Math.max(0,quietMs),600000)-now)
    return Math.max(quietRemaining,Math.max(0,heldUntil-now))
  }
  return {
    queue(value,{hold=false,now=Date.now()}={}){
      if(typeof value!=='string'||!value.trim())return
      if(openedAt===null)openedAt=now
      queued.push(value)
      if(queued.length>max)queued.splice(0,queued.length-max)
      if(hold)heldUntil=Math.max(heldUntil,now+Math.min(Math.max(0,holdMs),10000))
    },
    remaining,
    endStartupQuiet(){quietEnded=true},
    drain(now=Date.now()){
      if(remaining(now)>0)return []
      const result=queued
      queued=[]
      return result
    },
    pending(){return queued.length},
  }
}
