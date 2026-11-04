// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Py}from"/$bunfs/root/chunk-yx0yvz1d.js";import{aO,H6,Z4r,F6,NP}from"/$bunfs/root/chunk-thp9mgjc.js";import{ae}from"/$bunfs/root/chunk-pa6r6bee.js";async function odn({toolUseContext:e,forkContextMessages:o,mainThreadAgentDefinition:t}){let{systemPrompt:s,userContext:m,systemContext:r}=Z4r()??await i(e,t);return{systemPrompt:s,userContext:m,systemContext:r,toolUseContext:e,forkContextMessages:o,advisorModel:e.getAdvisorSetting()}}async function i(e,o){let[t,s,m]=await Promise.all([e.renderedSystemPrompt??n(e,o),NP(e.session,e.storageV5,e.credentials),F6(e.session,e.options.cacheBreakerPhrase)]);return{systemPrompt:t,userContext:s,systemContext:m}}async function n(e,o){let t=ae(e),s=await aO(e.options.tools,Py({permissionMode:t.mode,mainLoopModel:e.options.mainLoopModel}));return H6({mainThreadAgentDefinition:o,toolUseContext:e,customSystemPrompt:e.options.customSystemPrompt,defaultSystemPrompt:s,appendSystemPrompt:e.options.appendSystemPrompt})}
export{odn};
