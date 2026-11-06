import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const original=readFileSync(new URL('../src/commands/github/modelConfig.ts',import.meta.url),'utf8')
let source=original.replace(/^import .*$/gm,'').replace(/^export /gm,'')
source=stripTypeScriptTypes(source,{mode:'strip'})
const builder=Object.getPrototypeOf(async()=>{}).constructor

function setup({saved=[],current='openai/gpt-6',key='sk-private-local'}={}) {
 const calls=[],writes=[]
 const routes={
  openai:{provider:'openai',model:'gpt-6',protocol:'responses',endpoint:'https://api.openai.com/v1/responses'},
  deepseek:{provider:'deepseek',model:'deepseek-chat',protocol:'chat-completions',endpoint:'https://api.deepseek.com/chat/completions'},
  chatgpt:{provider:'chatgpt',model:'gpt-6',protocol:'responses',endpoint:'https://api.openai.com/v1/responses'},
 }
 const resolve=id=> {
  const [provider,...model]=id.split('/')
  const route=routes[provider]
  return route?{...route,model:model.join('/')} : null
 }
 const exec=async(command,args,options={})=>{
  assert.equal(command,'gh')
  calls.push([...args])
  if(options.input)writes.push(options.input)
  return {code:0,stdout:'',stderr:''}
 }
 return builder('getSavedModelOptions','getIndependentApiKey','resolveIndependentModel',
  'getAnthropicApiKey','getMainLoopModel','execFileNoThrow','validRepository','process',
  `${source}\nreturn {getGithubModelOptions,getGithubModelOption,getGithubActionsProviderOptions,configureGithubModel,configureGithubCustomModel}`)(
  ()=>saved,
  route=>route.provider==='chatgpt'?(()=>{throw Error('OAuth token requested')})():key,
  resolve,
  ()=>null,
  ()=>current,
  exec,
  raw=>{if(raw!=='org/code')throw Error('仓库无效');return raw},
  {env:{}}
 ).then(m=>({api:m,calls,writes}))
}

test('现有模型由本地注册信息获取，ChatGPT OAuth 不进入 Actions',async()=>{
 const {api}=await setup({saved:[
  {value:'chatgpt/gpt-6',label:'GPT OAuth',description:'ChatGPT 授权'},
  {value:'deepseek/deepseek-chat',label:'DS',description:'DeepSeek 模型'},
 ],current:'openai/gpt-6'})
 const opts=api.getGithubModelOptions()
 assert.deepEqual(opts.map(x=>x.id),['openai/gpt-6','deepseek/deepseek-chat'])
 assert.ok(opts.every(x=>!x.id.startsWith('chatgpt/')))
 assert.throws(()=>api.getGithubModelOption('chatgpt/gpt-6'),/OAuth/)
})
test('未明确同意时，不会调用 GitHub 或复制本地凭据',async()=>{
 const {api,calls,writes}=await setup()
 await assert.rejects(api.configureGithubModel('org/code','openai/gpt-6',false),/明确/)
 await assert.rejects(api.configureGithubCustomModel('org/code','openai','gpt-6','sk-try-this',false),/明确/)
 assert.equal(calls.length,0)
 assert.equal(writes.length,0)
})
test('新密钥只走 gh stdin 且不保存到本地凭据；配套变量完整写入',async()=>{
 const token='sk-secret-github-actions-only'
 const {api,calls,writes}=await setup({current:'chatgpt/gpt-6'})
 const result=await api.configureGithubCustomModel('org/code','deepseek','deepseek-chat',token,true)
 assert.match(result,/本机模型账号及密钥未改变/)
 assert.equal(writes.length,1)
 assert.equal(writes[0],token)
 assert.ok(calls.some(x=>x.includes('YAOYAOCHE_MODEL_API_KEY')))
 assert.ok(calls.some(x=>x.includes('YAOYAOCHE_MODEL_PROVIDER')))
 assert.ok(calls.some(x=>x.includes('YAOYAOCHE_MODEL_NAME')))
 assert.ok(calls.some(x=>x.includes('YAOYAOCHE_MODEL_BASE_URL')))
 assert.ok(calls.some(x=>x.includes('YAOYAOCHE_MODEL_TOKEN_FIELD')))
 assert.ok(!JSON.stringify(calls).includes(token),'密钥不能出现在命令行参数')
 assert.ok(!result.includes(token),'密钥不能出现在输出文本')
})
test('本地模型密钥复用走选定供应商，Actions 独立写入',async()=>{
 const {api,calls,writes}=await setup({current:'openai/gpt-6'})
 const result=await api.configureGithubModel('org/code','openai/gpt-6',true)
 assert.equal(writes[0],'sk-private-local')
 assert.ok(calls.some(x=>x.includes('openai-responses')))
 assert.ok(result.includes('本机授权状态及本地凭据文件未修改'))
})
test('新 API Key 及模型 ID 会在上传前校验',async()=>{
 const {api,calls}=await setup()
 await assert.rejects(api.configureGithubCustomModel('org/code','openai','bad model','sk-good-key',true),/模型名称/)
 await assert.rejects(api.configureGithubCustomModel('org/code','openai','gpt-6','a',true),/API Key/)
 await assert.rejects(api.configureGithubCustomModel('org/code','chatgpt','gpt-6','sk-good-key',true),/模型服务商/)
 assert.equal(calls.length,0)
})
