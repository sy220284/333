import assert from 'node:assert/strict'
import { test } from 'node:test'
import { forwardGatewayInference317 } from '../src/cli/gateway/gatewayForward317.mjs'

test('317 gateway: TTFB applies only until headers, not through a slow SSE body',async()=>{
  let calls=0,timer
  const oldFetch=globalThis.fetch
  globalThis.fetch=async (_url,{signal})=>{
    calls++
    const body=new ReadableStream({
      start(controller){
        controller.enqueue(new TextEncoder().encode('event: message_start\ndata: {}\n\n'))
        signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true})
        timer=setTimeout(()=>{
          if(signal.aborted)return
          controller.enqueue(new TextEncoder().encode('event: message_stop\ndata: {}\n\n'))
          controller.close()
        },120)
      },
    })
    return new Response(body,{status:200,headers:{'content-type':'text/event-stream'}})
  }
  try{
    const config={
      limits:{max_request_bytes:1024*1024},timeouts:{upstream_ttfb_ms:40},
      upstreams:[{name:'test',provider:'anthropic',models:['model-test'],
        base_url:'http://127.0.0.1:49173',auth:{api_key:'server-key'}}],models:[],
    }
    const request=new Request('http://gateway.test/v1/messages',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'model-test',stream:true,max_tokens:10,messages:[]}),
    })
    const response=await forwardGatewayInference317(request,{
      config,identity:{sub:'user1',groups:[]},audit:async()=>{},
    })
    assert.equal(response.status,200)
    const body=await response.text()
    assert.match(body,/message_start/)
    assert.match(body,/message_stop/)
    assert.equal(calls,1)
  }finally{
    clearTimeout(timer)
    globalThis.fetch=oldFetch
  }
})
