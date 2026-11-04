/**
 * Claude Code 2.1.317 enterprise gateway SDK provider execution boundary.
 * Native SDKs retain their provider-specific signing, credentials and URL rules.
 * HTTP credentials arriving from a client are never reused by these clients.
 */
import { readFile } from 'node:fs/promises'

const API_TIMEOUT_MS = 3600000
const JSON_HEADERS = {'content-type':'application/json'}
function badProvider(status, message, requestId) {
  return Response.json({type:'error',error:{
    type:status===501?'not_supported':status===401?'authentication_error':
      status===403?'permission_error':status===429?'rate_limit_error':
      status===400?'invalid_request_error':'api_error',
    message,
  }},{status,headers:{...JSON_HEADERS,'x-request-id':requestId,'cache-control':'no-store'}})
}
function cloudAuthOptions(up) {
  const auth=up.auth??{}
  if(auth.access_token){
    // Vertex ClientOptions supports accessToken directly; constructing a partial
    // authClient lacks the Google AuthClient credential transport contract.
    return {accessToken:auth.access_token}
  }
  return null
}
async function googleAuthOptions(up) {
  const immediate=cloudAuthOptions(up)
  if(immediate)return immediate
  const {GoogleAuth}=await import('google-auth-library')
  return {googleAuth:new GoogleAuth({
    scopes:['https://www.googleapis.com/auth/cloud-platform'],
    projectId:up.project_id,
    ...(up.auth?.service_account_json && {keyFilename:up.auth.service_account_json}),
  })}
}
async function awsSigv4Fetch(up) {
  const {SignatureV4}=await import('@smithy/signature-v4')
  const {Sha256}=await import('@aws-crypto/sha256-js')
  const {defaultProvider}=await import('@aws-sdk/credential-provider-node')
  const secret=up.auth??{}
  const credentials=secret.aws_access_key_id && secret.aws_secret_access_key
    ? {accessKeyId:secret.aws_access_key_id,secretAccessKey:secret.aws_secret_access_key,
      ...(secret.aws_session_token && {sessionToken:secret.aws_session_token})}
    : defaultProvider()
  const signer=new SignatureV4({
    service:'aws-external-anthropic', region:up.region,credentials,sha256:Sha256,
  })
  return async (input: RequestInfo | URL, init: RequestInit = {})=>{
    const request=new Request(input,init)
    const url=new URL(request.url)
    const body=init.body??(request.body?await request.clone().arrayBuffer():undefined)
    const headers=Object.fromEntries(request.headers)
    delete headers.authorization
    delete headers['x-api-key']
    const signed=await signer.sign({
      protocol:url.protocol,hostname:url.hostname,port:url.port?Number(url.port):undefined,
      path:url.pathname+url.search,method:request.method,
      headers:{...headers,host:url.host},body,
    })
    return fetch(url,{...init,method:signed.method,body,
      headers:signed.headers,redirect:'manual',signal:init.signal})
  }
}
async function tokenizedGoogleFetch(up){
  const auth=up.auth??{}
  const tokenProvider=auth.access_token?async()=>auth.access_token:async()=>{
    const {GoogleAuth}=await import('google-auth-library')
    const client=new GoogleAuth({
      scopes:['https://www.googleapis.com/auth/cloud-platform'],
      projectId:up.project_id,
      ...(auth.service_account_json && {keyFilename:auth.service_account_json}),
    })
    const token=await client.getAccessToken()
    if(!token)throw new Error('Google Cloud credentials did not yield an access token')
    return token
  }
  return async (input: RequestInfo | URL, init: RequestInit = {})=>{
    const headers=new Headers(init.headers)
    headers.delete('x-api-key')
    headers.delete('authorization')
    headers.set('authorization','Bearer '+await tokenProvider())
    return fetch(input,{...init,headers,redirect:'manual'})
  }
}
export async function createGatewayProviderClient317(up, testFactory) {
  if(testFactory) return await testFactory(up)
  const auth=up.auth??{}
  switch(up.provider){
    case 'bedrock':
    case 'mantle': {
      const classes=await import('@anthropic-ai/bedrock-sdk')
      const Client=up.provider==='mantle'?
        (classes as typeof classes & { AnthropicBedrockMantle?: typeof classes.AnthropicBedrock }).AnthropicBedrockMantle : classes.AnthropicBedrock
      if(typeof Client!=='function')
        throw new Error('The rebuilt SDK is missing '+up.provider+' client')
      const awsCredentials={
        ...(auth.aws_access_key_id && {awsAccessKey:auth.aws_access_key_id,
          awsSecretKey:auth.aws_secret_access_key,
          awsSessionToken:auth.aws_session_token}),
        ...(auth.aws_bearer_token && {apiKey:auth.aws_bearer_token}),
      }
      const guardHeaders=up.provider==='bedrock' ? {
        ...(up.guardrail && {
          'X-Amzn-Bedrock-GuardrailIdentifier':up.guardrail.id,
          'X-Amzn-Bedrock-GuardrailVersion':up.guardrail.version,
        }),
        ...(up.guardrail_trace && {'X-Amzn-Bedrock-Trace':'ENABLED'}),
      } : {}
      return new Client({awsRegion:up.region,...(up.base_url&&{baseURL:up.base_url}),
        ...awsCredentials,defaultHeaders:{...up.headers,...guardHeaders},
        timeout:API_TIMEOUT_MS,maxRetries:0})
    }
    case 'anthropicAws': {
      const {default:Anthropic}=await import('@anthropic-ai/sdk')
      const baseURL=up.base_url??'https://aws-external-anthropic.'+up.region+'.api.aws'
      const directKey=auth.api_key??process.env.ANTHROPIC_AWS_API_KEY
      return new Anthropic({
        baseURL,apiKey:directKey??'sigv4',maxRetries:0,timeout:API_TIMEOUT_MS,
        defaultHeaders:{...up.headers,'anthropic-workspace-id':up.workspace_id},
        ...(!directKey&&{fetch:await awsSigv4Fetch(up)}),
      })
    }
    case 'anthropicGoogleCloud': {
      const {default:Anthropic}=await import('@anthropic-ai/sdk')
      const baseURL=up.base_url ??
        'https://claude.googleapis.com/v1/projects/'+encodeURIComponent(up.project_id)+
        '/locations/'+encodeURIComponent(up.location??'global')+
        '/workspaces/'+encodeURIComponent(up.workspace_id)+'/invoke'
      return new Anthropic({baseURL,apiKey:'google-oauth',
        timeout:API_TIMEOUT_MS,maxRetries:0,defaultHeaders:up.headers??{},
        fetch:await tokenizedGoogleFetch(up)})
    }
    case 'vertex': {
      const {AnthropicVertex}=await import('@anthropic-ai/vertex-sdk')
      const credentials=await googleAuthOptions(up)
      return new AnthropicVertex({region:up.region,projectId:up.project_id,
        ...(up.base_url&&{baseURL:up.base_url}),...credentials,
        defaultHeaders:up.headers??{},timeout:API_TIMEOUT_MS,maxRetries:0})
    }
    case 'foundry': {
      const {AnthropicFoundry}=await import('@anthropic-ai/foundry-sdk')
      const credentials=auth.api_key
        ? {apiKey:auth.api_key}
        : {apiKey:null,azureADTokenProvider:async()=>{
          const {DefaultAzureCredential}=await import('@azure/identity')
          const token=await new DefaultAzureCredential().getToken(
            'https://cognitiveservices.azure.com/.default')
          if(!token)throw new Error('Foundry Azure AD token is unavailable')
          return token.token
        }}
      return new AnthropicFoundry({
        ...(up.base_url?{baseURL:up.base_url}:{resource:up.resource}),
        ...credentials,defaultHeaders:up.headers??{},
        timeout:API_TIMEOUT_MS,maxRetries:0,
      })
    }
    default:throw new Error('Unknown SDK provider '+up.provider)
  }
}
function providerResponseHeaders(response, sse) {
  const headers=new Headers()
  if(sse)headers.set('content-type','text/event-stream; charset=utf-8')
  else headers.set('content-type','application/json')
  for(const name of ['request-id','retry-after','anthropic-ratelimit-requests-limit',
    'anthropic-ratelimit-requests-remaining','anthropic-ratelimit-tokens-limit',
    'anthropic-ratelimit-tokens-remaining']){
    const value=response?.headers?.get(name)
    if(value)headers.set(name,value)
  }
  return headers
}
function encodeEvents(events, requestedModel) {
  const encoder=new TextEncoder()
  const iterator=events[Symbol.asyncIterator]()
  return new ReadableStream({
    async pull(controller){
      try{
        const next=await iterator.next()
        if(next.done){controller.close();return}
        const value=next.value
        const event=requestedModel&&value?.type==='message_start' &&value.message
          ? {...value,message:{...value.message,model:requestedModel}}:value
        controller.enqueue(encoder.encode(
          'event: '+String(event.type??'message')+'\n'+
          'data: '+JSON.stringify(event)+'\n\n'))
      }catch(error){controller.error(error)}
    },
    async cancel(reason){await iterator.return?.(reason)},
  })
}
export type GatewayForwardSdkOptions317 = {
  requestId?: string; requestedModel?: string; signal?: AbortSignal;
  timeoutMs?: number; extraHeaders?: Record<string, string>;
  providerFactory?: (upstream: unknown) => Promise<unknown>
}
export async function forwardGatewaySdk317(up, payload, path, options: GatewayForwardSdkOptions317 = {}) : Promise<Response> {
  const {requestId='-', requestedModel, signal, timeoutMs, extraHeaders={},
    providerFactory}=options
  const name=up.provider
  if('workspace_id' in payload)
    return badProvider(400,'workspace_id: not supported through the gateway',requestId)
  if(path==='/v1/messages/count_tokens' && name==='bedrock')
    return badProvider(501,'count_tokens is not available on this Bedrock upstream',requestId)
  try{
    const sdk=await createGatewayProviderClient317(up,providerFactory)
    const params={signal, ...(timeoutMs&&{timeout:Math.min(timeoutMs,API_TIMEOUT_MS)}),
      ...(Object.keys(extraHeaders).length&&{headers:extraHeaders})}
    let result
    if(path==='/v1/messages/count_tokens'){
      result=await sdk.messages.countTokens(payload,params).withResponse()
      return new Response(JSON.stringify(result.data),{
        status:result.response?.status??200,
        headers:providerResponseHeaders(result.response,false),
      })
    }
    result=await sdk.messages.create(payload,params).withResponse()
    const body=payload.stream?encodeEvents(result.data,requestedModel):
      JSON.stringify(requestedModel?{...result.data,model:requestedModel}:result.data)
    return new Response(body,{
      status:result.response?.status??200,
      headers:providerResponseHeaders(result.response,Boolean(payload.stream)),
    })
  }catch(error){
    const status=Number.isInteger(error?.status) && error.status>=400 &&
      error.status<=599 ? error.status:502
    const message=[400,413].includes(status) && error?.error?.error?.message
      ? String(error.error.error.message).slice(0,1000)
      : status===401?'upstream authentication failed':
        status===403?'upstream denied the request':
        status===429?'upstream rate limit exceeded':
        'upstream '+name+' request failed'
    return badProvider(status,message,requestId)
  }
}
