import { test, expect } from 'bun:test'
import { z } from 'zod/v4'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createLinkedTransportPair } from '../src/services/mcp/InProcessTransport.ts'
import { createSdkMcpServer, tool } from '../src/entrypoints/agentSdkTypes.ts'

test('317 SDK tool() preserves parameter schema, metadata and actual MCP handler', async () => {
  const call = tool('echo_317','Echoes a validated input',{
    text:z.string().min(1),
  },async (input, _extra)=>({
    content:[{type:'text',text:'echo:'+input.text}],
  }),{annotations:{readOnlyHint:true},searchHint:'Echo user text',alwaysLoad:true})
  expect(call.searchHint).toBe('Echo user text')
  expect(call.alwaysLoad).toBe(true)
  expect(call.annotations?.readOnlyHint).toBe(true)

  const server=createSdkMcpServer({name:'SDK tests',version:'2.1.317',tools:[call]})
  expect(server.type).toBe('sdk')
  expect(server.name).toBe('SDK tests')
  const [clientTransport,serverTransport]=createLinkedTransportPair()
  const client=new Client({name:'sdk-test-client',version:'1.0.0'})
  try {
    await server.instance.connect(serverTransport)
    await client.connect(clientTransport)
    const listed=await client.listTools()
    expect(listed.tools.map(x=>x.name)).toContain('echo_317')
    expect(listed.tools.find(x=>x.name==='echo_317')?.annotations?.readOnlyHint).toBe(true)
    const result=await client.callTool({name:'echo_317',arguments:{text:'real call'}})
    expect(result.content).toEqual([{type:'text',text:'echo:real call'}])
    const invalid=await client.callTool({name:'echo_317',arguments:{text:''}})
    expect(invalid.isError).toBe(true)
  } finally {
    await client.close()
    await server.instance.close()
  }
})

test('317 SDK tool registry rejects duplicate names and empty tool names', () => {
  const repeat=tool('repeat','Repeats',{},async()=>({content:[{type:'text',text:'ok'}]}))
  expect(()=>createSdkMcpServer({name:'',tools:[repeat]})).toThrow('name')
  expect(()=>createSdkMcpServer({name:'duplicate-tools',tools:[repeat,repeat]})).toThrow('Duplicate')
  expect(()=>tool(' ','Empty',{},async()=>({content:[]}))).toThrow('name')
})
