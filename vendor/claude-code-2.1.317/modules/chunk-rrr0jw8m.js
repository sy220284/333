// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ne,Nr,KL}from"./chunk-sctdt2my.js";import{l}from"./chunk-xkb87seb.js";import{nro}from"./chunk-znfj4248.js";import{eI}from"./chunk-24dm2j9j.js";import{ul}from"./chunk-aqqhd5p4.js";var Lqn=5,H2s="Structured output was retracted by a model fallback and no retry produced a valid result",d=600;function N2s(t,r,e){if(r>0)return`Failed to provide surviving structured output after ${t} attempts (${r} retracted by a model fallback)`;let n=`Failed to provide valid structured output after ${t} attempts`;return e===void 0?n:`${n} \u2014 last StructuredOutput error: ${e}`}function zMo(t){let r=typeof t==="string"?t:Array.isArray(t)?t.flatMap((i)=>i.type==="text"?[i.text]:[]).join(`
`):void 0;if(r===void 0)return;let n=r.replace(/^<tool_use_error>/,"").replace(/<\/tool_use_error>$/,"").replace(nro,`
`).split(`
`).map(KL).join(`
`),o=eI(n,{prependMarker:!1}).sanitized,u=Nr(o);if(u.length===0)return;let s=u.length>d?ne(u,d)+"\u2026":u;return eI(s,{prependMarker:!1}).sanitized}function $2s(t,r){try{let e=r===void 0?0:t.lastIndexOf(r)+1;return a(e===0?t:t.slice(e))}catch(e){l(e);return}}function a(t){let r=new Set;for(let e of t){if(e?.type!=="assistant")continue;let n=e.message.content;if(!Array.isArray(n))continue;for(let o of n)if(o.type==="tool_use"&&o.name===ul)r.add(o.id)}if(r.size===0)return;for(let e=t.length-1;e>=0;e--){let n=t[e];if(n?.type!=="user")continue;let o=n.message.content;if(!Array.isArray(o))continue;for(let u=o.length-1;u>=0;u--){let s=o[u];if(s?.type==="tool_result"&&s.is_error===!0&&r.has(s.tool_use_id))return zMo(s.content)}}return}
export{Lqn,H2s,N2s,zMo,$2s};
