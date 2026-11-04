// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{iAo}from"/$bunfs/root/chunk-xeb888e4.js";import{Cf}from"/$bunfs/root/chunk-5x4vp4dg.js";import{vb}from"/$bunfs/root/chunk-wxyh2ndv.js";import{fd}from"/$bunfs/root/chunk-r6v32v6p.js";import{fr,Tu}from"/$bunfs/root/chunk-gjbaq629.js";import{HP,Md,Le,is}from"/$bunfs/root/chunk-thp9mgjc.js";import{$bt}from"/$bunfs/root/chunk-328ynszm.js";import{dg}from"/$bunfs/root/chunk-md5wm0jt.js";var w=/^\/btw\b/gi,E="_/btw can't run tools: any tool calls or tool output shown above were not executed and may not reflect your actual files or data. Ask in the main conversation to check._",A="(That answer wrote tool calls as text. Nothing was executed, so it is omitted here.)",b="_(This answer was cut off before it finished. Ask again to retry.)_",_="(That answer was cut off before it finished, so it is omitted here.)",k="[No result yet \u2014 this call is still in progress in the main conversation (running, awaiting approval, or queued)]";function ZOr(s){let r=[],i=s.matchAll(w);for(let o of i)if(o.index!==void 0)r.push({word:o[0],start:o.index,end:o.index+o[0].length});return r}async function K$t({question:s,cacheSafeParams:r,parentController:i,onRetry:o,threadHistory:l=!0,history:a,turnInProgress:t=!0,agentId:e}){let y=i?Tu(i):fr(),f=l?r.toolUseContext.session.btwHistory:null,M=(a??f?.exchanges.filter((n)=>n.agentId===e)??[]).flatMap((n)=>{let u=iAo(n.response)?A:n.response.endsWith(b)?_:n.response;return[Le({content:n.question}),Md({content:n.fallbackNotice?`\u26A0 ${n.fallbackNotice}

${u}`:u})]}),h=t?x(r.forkContextMessages):void 0;try{let n=await HP({promptMessages:[...h?[h]:[],...M,Le({content:[{type:"text",text:`<system-reminder>This is a side question from the user. You must answer this question directly in a single response.

IMPORTANT CONTEXT:
- You are a separate, lightweight agent spawned to answer this one question
- The main agent is NOT interrupted - it continues working independently in the background
- You share the conversation context but are a completely separate instance
- Do NOT reference being interrupted or what you were "previously doing" - that framing is incorrect

CRITICAL CONSTRAINTS:
- You have NO tools available - you cannot read files, run commands, search, or take any actions
- Do NOT write tool calls or tool output as text (for example invoke or function_calls XML blocks) - nothing you write here is executed; if answering would need reading files, running commands, or searching, say that can't be checked from a side question and suggest asking in the main conversation
- This is a one-off response - there will be no follow-up turns
- You can ONLY provide information based on what you already know from the conversation context
- NEVER say things like "Let me try...", "I'll now...", "Let me check...", or promise to take any action
- If you don't know the answer, say so - do not offer to look it up or investigate

Simply answer the question with the information you have.</system-reminder>

`},{type:"text",text:s}]})],cacheSafeParams:r,canUseTool:async()=>({behavior:"deny",message:"Side questions cannot use tools",decisionReason:{type:"other",reason:"side_question"}}),querySource:"side_question",forkLabel:"side_question",maxTurns:1,skipCacheWrite:!0,skipTranscript:!0,overrides:{abortController:y},onMessage:o?(c)=>{if(T(c))o({retryAttempt:c.retryAttempt,maxRetries:c.maxRetries,retryInMs:c.retryInMs,status:c.error.status})}:void 0}),{live:u,notice:d}=$bt(n.messages),{response:p,synthetic:m}=N(u),g=d&&{originalModel:d.originalModel,fallbackModel:d.fallbackModel,content:d.content};if(f&&p&&!m)f.append(s,p,g?.content,e);return{response:p,synthetic:m,usage:n.totalUsage,...g&&!m&&{refusalFallback:g}}}catch(n){if(n instanceof Cf||y.signal.aborted)return{response:null,synthetic:!1,usage:dg,aborted:!0};throw n}}function x(s){let r=s.filter((t)=>!vb(t)),i=r.findLast((t)=>t.type==="assistant");if(!i)return;let o=new Set,l=[];for(let t of r)if(t.type==="user"&&Array.isArray(t.message.content)){for(let e of t.message.content)if(e.type==="tool_result")o.add(e.tool_use_id)}else if(t.type==="assistant"&&t.message.id===i.message.id){for(let e of t.message.content)if(e.type==="tool_use")l.push(e.id)}let a=l.filter((t)=>!o.has(t));if(a.length===0)return;return Le({content:a.map((t)=>({type:"tool_result",tool_use_id:t,content:k})),isMeta:!0})}function N(s){let r=s.flatMap((e)=>e.type==="assistant"&&!e.isApiErrorMessage?e.message.content:[]),i=s.find((e)=>e.type==="assistant"&&e.isApiErrorMessage===!0),o=is(r,`

`).trim();if(o){let e=[...iAo(o)?[E]:[],...i?[b]:[]];return{response:[o,...e].join(`

`),synthetic:!1}}let l=r.find((e)=>e.type==="tool_use");if(l)return{response:`(The model tried to call ${"name"in l?l.name:"a tool"} instead of answering directly. Try rephrasing or ask in the main conversation.)`,synthetic:!0};let a=i?is(i.message.content,`

`).trim():"";if(a)return{response:`(API error: ${a.startsWith(`${fd}: `)?a.slice(fd.length+2):a})`,synthetic:!0};let t=s.find(T);if(t)return{response:`(API error: ${t.error.formatted})`,synthetic:!0};return{response:null,synthetic:!1}}function T(s){return s.type==="system"&&"subtype"in s&&s.subtype==="api_error"}
export{ZOr,K$t};
