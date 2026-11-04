// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"./chunk-c3q80g49.js";import{is}from"./chunk-thp9mgjc.js";import{o,oe,A,u,T}from"./chunk-e56bj9s5.js";var Pjs="Resumed agent. Its final report is not in this message.",Ijs="Resumed agent. Its final report follows this JSON, framed by the harness.";function Uxo({displayName:e,content:n}){return`Resumed agent ${e}. Result:

${is(n,`
`)||"(no text output)"}`}var Bxo=p(()=>u({message:o().optional(),display:o().optional(),inlineHandback:u({displayName:o(),content:A(u({type:T("text"),text:o()}))}).optional().catch(void 0),routing:oe().optional(),request_id:oe().optional(),target:oe().optional()}));function jxo(e){if(e.routing)return;if(e.request_id!==void 0&&e.target!==void 0)return;return e.display??(e.inlineHandback?Uxo(e.inlineHandback):e.message)}function Ojs(e){let n=Bxo().safeParse(e);return n.success?jxo(n.data)??"":""}
export{Pjs,Ijs,Uxo,Bxo,jxo,Ojs};
