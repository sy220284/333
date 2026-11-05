/**
 * 2.1.317 self-hosted Runner remote agent files delivery.
 * Original: chunk-j5svdpw5.js Wl/Kl/Yl/Wa, lines 1028–1053.
 *
 * Reuses the same markdown frontmatter parsing and CLI agents schema as
 * ordinary Claude Code. Remote agent definitions override same-named
 * server JSON entries, then all agents are validated together.
 */
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import {
  parseAgentFromMarkdown,
  validateCliAgentsConfiguration,
} from '../../tools/AgentTool/loadAgentsDir.js'

const NAME = /^[a-z][a-z0-9-]{0,63}$/
const MAX_AGENT_FILES = 64
const MAX_AGENT_CONTENT_BYTES = 1_048_576

export type RunnerStagedAgentConfig317 = {
  args: string[]
  paths: string[]
  count: number
}

export async function stageRunnerAgentFiles317(
  incoming: unknown, serverAgentsArg: unknown, configDir: string,
):Promise<RunnerStagedAgentConfig317>{
  if(!Array.isArray(incoming)){
    throw new TypeError('agent_files is not an array')
  }
  if(incoming.length>MAX_AGENT_FILES){
    throw new RangeError('agent_files has too many entries (at most 64)')
  }
  const names=new Set<string>()
  const remoteAgents:Record<string,Record<string,unknown>>={}
  for(const entry of incoming){
    if(!entry || typeof entry!=='object' || Array.isArray(entry)){
      throw new TypeError('agent_files entry is not an object')
    }
    const record=entry as Record<string,unknown>
    const name=record.name
    if(typeof name!=='string' || !NAME.test(name)){
      throw new TypeError('agent_files entry has an invalid name')
    }
    const content=record.content
    if(typeof content!=='string' ||
       Buffer.byteLength(content,'utf8')>MAX_AGENT_CONTENT_BYTES){
      throw new TypeError('agent_files entry has invalid content')
    }
    if(names.has(name)) throw new Error('agent_files contains duplicate name: '+name)
    names.add(name)
    const markdown=parseFrontmatter(content,name+'.md')
    const agent=parseAgentFromMarkdown(name+'.md',configDir,
      markdown.frontmatter,markdown.content,'flagSettings')
    if(!agent || agent.agentType!==name){
      throw new Error('agent_files entry '+name+
        ' is not a matching agent definition (name and description required)')
    }
    const definition:Record<string,unknown>={
      description:agent.whenToUse,
      prompt:markdown.content.trim(),
    }
    for(const key of [
      'tools','disallowedTools','model','effort','permissionMode',
      'mcpServers','hooks','maxTurns','skills','initialPrompt',
      'memory','background','isolation','omitClaudeMd',
    ] as const) {
      const value=agent[key]
      if(value!==undefined) definition[key]=value
    }
    remoteAgents[name]=definition
  }
  let server:Record<string,unknown>={}
  if(serverAgentsArg!==undefined && String(serverAgentsArg)!==''){
    let parsed:unknown
    try{parsed=JSON.parse(String(serverAgentsArg))}
    catch(error){throw new TypeError('claude_code_args agents is invalid JSON',{cause:error})}
    if(parsed===null || typeof parsed!=='object' || Array.isArray(parsed)){
      throw new TypeError('claude_code_args agents is not a JSON object')
    }
    server=parsed as Record<string,unknown>
  }
  if(incoming.length===0 && Object.keys(server).length===0){
    return {args:[],paths:[],count:0}
  }
  const merged={...server,...remoteAgents}
  validateCliAgentsConfiguration(merged)
  const path=join(configDir,randomUUID()+'-remote-agents.json')
  await writeFile(path,JSON.stringify(merged),{
    encoding:'utf8',mode:0o600,flag:'wx',
  })
  return {args:['--agents',path],paths:[path],count:Object.keys(merged).length}
}
