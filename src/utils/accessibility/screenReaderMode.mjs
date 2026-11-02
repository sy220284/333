/** 2.1.310: explicit CLI switch, environment and trusted settings only.
 * Project/local settings can request a warning but cannot enable this mode.
 * The caller supplies settings by source; no merged untrusted settings are read.
 */
export function resolveScreenReaderMode({argv=[],env={},trustedSettings=[]}={}) {
  if (argv.includes('--ax-screen-reader')) return {enabled:true,source:'flag'}
  if (Object.hasOwn(env,'CLAUDE_AX_SCREEN_READER')) {
    const value=env.CLAUDE_AX_SCREEN_READER
    return {enabled:value===true || /^(?:1|true|yes|on)$/i.test(String(value)),source:'env'}
  }
  for(const source of trustedSettings) {
    if(source?.settings?.axScreenReader === true) return {enabled:true,source:'settings'}
    if(source?.settings?.axScreenReader === false) return {enabled:false,source:'settings'}
  }
  return {enabled:false}
}
export function screenReaderChildEnvironment(mode) {
  return mode.enabled ? {CLAUDE_AX_SCREEN_READER:'1'} : {}
}
/** Plain accessibility text is rendered without the terminal diff/animation
 * engine. This traversal preserves user text but excludes decorative frames.
 */
export function flattenAccessibleTree(root) {
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
    if(block) flush()
    for(const child of node.childNodes??[]) walk(child)
    if(block) flush()
  }
  walk(root)
  return blocks.join('\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
}
export function accessibleOutputDelta(previous='',current='') {
  if(current===previous) return ''
  if(!current) return ''
  if(!previous) return current+'\n'
  if(current.startsWith(previous)) return current.slice(previous.length)+'\n'
  const oldLines=previous.split('\n'),lines=current.split('\n')
  let common=0
  while(common<oldLines.length && common<lines.length && oldLines[common]===lines[common]) common++
  if (common===oldLines.length-1 && lines.length===oldLines.length &&
      lines[common].startsWith(oldLines[common])) {
    return lines[common].slice(oldLines[common].length)+'\n'
  }
  // On edits, announce only the changed tail; never erase the terminal
  // transcript with escape sequences (screen readers need persistent text).
  const changed=lines.slice(common).join('\n').trim()
  return changed ? changed+'\n' : ''
}
