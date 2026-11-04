// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ie}from"./chunk-y9ysdmh2.js";import{Ir,MV}from"./chunk-sxtzjrdg.js";import{tHn}from"./chunk-jfgvczh1.js";import{yer}from"./chunk-thp9mgjc.js";import{Avn,io}from"./chunk-m2fhx9k0.js";import{js}from"./chunk-3xytyxyc.js";function x5n(o){let a=C(o);if(a===null)return null;let n=Ir(o.totalTokens-o.rawMaxTokens),i=Ir(o.rawMaxTokens);if(a==="hard_limit"){let p=Ie(process.env.DISABLE_COMPACT)?"/clear":"/compact or /clear";return`Context exceeds the ${i}-token limit by ${n} tokens \u2014 run ${p} to continue.`}let m=Ie(process.env.DISABLE_COMPACT)?"/clear":"/compact";return`Context is ${n} tokens past the ${i}-token compaction window \u2014 run ${m} to reduce usage.`}function C(o){if(o.totalTokens<=o.rawMaxTokens)return null;return o.autocompactSource==="auto"?"hard_limit":"compaction_window"}function P5n(o){let{categories:a,totalTokens:n,rawMaxTokens:i,percentage:m,model:p,memoryFiles:u,mcpTools:k,agents:g,skills:l,messageBreakdown:y,systemTools:f,systemPromptSections:T}=o,t=`## Context Usage

`;t+=`**Model:** ${p}  
`,t+=`**Tokens:** ${Ir(n)} / ${Ir(i)} (${m}%)
`;let d=x5n(o);if(d)t+=`**Over limit:** ${d}
`;t+=`
`;let c=a.filter((e)=>e.tokens>0&&e.name!=="Free space"&&e.name!=="Autocompact buffer");if(c.length>0){t+=`### Estimated usage by category

`,t+=`| Category | Tokens | Percentage |
`,t+=`|----------|--------|------------|
`;for(let r of c){let x=(r.tokens/i*100).toFixed(1);t+=`| ${r.name} | ${Ir(r.tokens)} | ${x}% |
`}let e=a.find((r)=>r.name==="Free space");if(e&&e.tokens>0){let r=(e.tokens/i*100).toFixed(1);t+=`| Free space | ${Ir(e.tokens)} | ${r}% |
`}let s=a.find((r)=>r.name==="Autocompact buffer");if(s&&s.tokens>0){let r=(s.tokens/i*100).toFixed(1);t+=`| Autocompact buffer | ${Ir(s.tokens)} | ${r}% |
`}t+=`
`}if(k.length>0){t+=`### MCP Tools

`,t+=`| Tool | Server | Tokens |
`,t+=`|------|--------|--------|
`;for(let e of k)t+=`| ${e.name} | ${e.serverName} | ${Ir(e.tokens)} |
`;t+=`
`}if(f&&f.length>0,T&&T.length>0,g.length>0){t+=`### Custom Agents

`,t+=`| Agent Type | Source | Tokens |
`,t+=`|------------|--------|--------|
`;for(let e of g){let s;switch(e.source){case"projectSettings":s="Project";break;case"userSettings":s="User";break;case"localSettings":s="Local";break;case"flagSettings":s="Flag";break;case"policySettings":s="Policy";break;case"plugin":s="Plugin";break;case"built-in":s="Built-in";break;default:s=String(e.source)}t+=`| ${e.agentType} | ${s} | ${Ir(e.tokens)} |
`}t+=`
`}if(u.length>0){t+=`### Memory Files

`,t+=`| Type | Path | Tokens |
`,t+=`|------|------|--------|
`;for(let e of u)t+=`| ${e.type} | ${e.path} | ${Ir(e.tokens)} |
`;t+=`
`}if(l&&l.tokens>0&&l.skillFrontmatter.length>0){t+=`### Skills

`,t+=`| Skill | Source | Tokens |
`,t+=`|-------|--------|--------|
`;for(let e of l.skillFrontmatter){let s=tHn(e.source)+(e.pluginName&&e.source!=="syncedSkills"?` (${e.pluginName})`:"");t+=`| ${e.name} | ${s} | ${MV(e.tokens)} |
`}t+=`
`}return t}async function K_e(o){let{session:a,messages:n,getAppState:i,options:{mainLoopModel:m,tools:p,agentDefinitions:u,customSystemPrompt:k,appendSystemPrompt:g,systemPromptSnapshot:l,excludeDynamicSections:y,mcpClients:f},detail:T,terminalWidth:t,localPaths:d}=o,c=js(n),e=i(),s=await yer(c,m,async()=>e.toolPermissionContext,p,u,{session:a,toolUseContext:{options:{customSystemPrompt:k,appendSystemPrompt:g,systemPromptSnapshot:l,mcpClients:f},getMcp:o.getMcp,storageV5:o.storageV5,credentials:o.credentials},originalMessages:c,configuredWindow:e.autoCompactWindow,excludeDynamicSections:y,detail:T,terminalWidth:t,localPaths:d});return Avn(a)?{...s,deferredBuiltinTools:void 0,systemTools:void 0,systemPromptSections:void 0}:s}async function V8i(o,a){let n=await K_e(a),m=io(a.session)?{...n,memoryFiles:[]}:n;return{type:"text",value:P5n(Avn(a.session)?{...m,messageBreakdown:void 0}:m),contextUsage:Rzi(m)}}function Rzi(o){let a=C(o);return{model:o.model,total_tokens:o.totalTokens,raw_max_tokens:o.rawMaxTokens,percentage:o.percentage,...a!==null&&{over_limit:{tokens_over:o.totalTokens-o.rawMaxTokens,kind:a}},categories:o.categories.map((n)=>({name:n.name,tokens:n.tokens,kind:n.kind})),mcp_tools:o.mcpTools.map((n)=>({name:n.name,server_name:n.serverName,tokens:n.tokens})),memory_files:o.memoryFiles.map((n)=>({path:n.path,type:n.type,tokens:n.tokens})),agents:o.agents.map((n)=>({agent_type:n.agentType,source:n.source,tokens:n.tokens})),...o.skills&&o.skills.skillFrontmatter.length>0&&{skills:o.skills.skillFrontmatter.map((n)=>({name:n.name,source:n.source,...n.pluginName!==void 0&&{plugin_name:n.pluginName},tokens:n.tokens}))}}}
export{x5n,P5n,K_e,V8i,Rzi};
