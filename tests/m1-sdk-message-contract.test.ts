import { expect, test } from 'bun:test'
import {
  SDKAssistantMessageSchema,
  SDKUserMessageSchema,
  SDKResultErrorSchema,
  SDKResultMessageSchema,
  UUIDPlaceholder,
} from '../src/entrypoints/sdk/coreSchemas.js'

const uuid='123e4567-e89b-42d3-a456-426614174000'
test('SDK assistant envelope supplies a validated API message to CCR and REPL',()=>{
 const value={type:'assistant',uuid,session_id:'session',
   parent_tool_use_id:null,
   message:{type:'message',id:'msg_test',role:'assistant',model:'claude-sonnet-4-6',
     content:[{type:'text',text:'hello'}],stop_reason:'end_turn',
     stop_sequence:null,usage:{input_tokens:1,output_tokens:2}}}
 expect(SDKAssistantMessageSchema().safeParse(value).success).toBe(true)
 expect(SDKAssistantMessageSchema().safeParse({...value,message:{content:[{type:'text'}]}}).success).toBe(false)
 expect(SDKAssistantMessageSchema().safeParse({...value,message:{...value.message,content:'wrong'}}).success).toBe(false)
})
test('SDK user message content is text or typed content blocks, never arbitrary unknown data',()=>{
 const base={type:'user',uuid,session_id:'session',parent_tool_use_id:null}
 expect(SDKUserMessageSchema().safeParse({...base,message:{role:'user',content:'hello'}}).success).toBe(true)
 expect(SDKUserMessageSchema().safeParse({...base,message:{role:'user',content:[{type:'tool_result',tool_use_id:'toolu_1',content:'done'}]}}).success).toBe(true)
 expect(SDKUserMessageSchema().safeParse({...base,message:{role:'assistant',content:[]}}).success).toBe(false)
 expect(SDKUserMessageSchema().safeParse({...base,message:{role:'user',content:[null]}}).success).toBe(false)
})
test('SDK UUIDs preserve canonical session/message identifiers and reject non-UUID strings',()=>{
 expect(UUIDPlaceholder().safeParse(uuid).success).toBe(true)
 expect(UUIDPlaceholder().safeParse('session-not-a-uuid').success).toBe(false)
 expect(SDKUserMessageSchema().safeParse({type:'user',uuid:'bad-id',
   parent_tool_use_id:null,message:{role:'user',content:'hello'}}).success).toBe(false)
})

test('2.1.317 API error envelope keeps success subtype but is_error=true', () => {
  const usage = {
    input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const event = {
    type: 'result', subtype: 'success', is_error: true,
    terminal_reason: 'api_error', result: 'Not logged in',
    duration_ms: 1, duration_api_ms: 0, num_turns: 1,
    stop_reason: null, session_id: uuid, total_cost_usd: 0,
    usage, modelUsage: {}, permission_denials: [], errors: ['Not logged in'], uuid,
  }
  expect(SDKResultErrorSchema().safeParse(event).success).toBe(true)
  expect(SDKResultMessageSchema().safeParse(event).success).toBe(true)
  expect(SDKResultErrorSchema().safeParse({ ...event, is_error: false }).success).toBe(false)
  expect(SDKResultMessageSchema().safeParse({ ...event, is_error: false, terminal_reason: 'completed' }).success).toBe(true)
})
