import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { forwardGatewayInference317 } from '../src/cli/gateway/gatewayForward317.mjs'

test('317 gateway: initial upstream deadline must not interrupt a valid long SSE response',async()=>{
  let calls=0
  const upstream=createServer((req,res)=>{
    calls++
    assert.equal(req.method,'POST')
    res.writeHead(200,{'content-type':'text/event-stream'})
    res.flushHeaders()
    res.write('event: message_start\ndata: {"type":"message_start"}\n\n')
    setTimeout(()=>res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n'),110)
  })
  upstream.listen(0,'127.0.0.1')
  await once(upstream,'listening')
  try{
    const config={
      limits:{max_request_bytes:1024*1024},timeouts:{upstream_ttfb_ms:40},
      upstreams:[{name:'test',provider:'anthropic',models:['model-test'],
        base_url:'http://127.0.0.1:'+upstream.address().port,
        auth:{api_key:'server-key'}}],models:[],
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
    await new Promise((ok,bad)=>upstream.close(error=>error?bad(error):ok()))
  }
})
