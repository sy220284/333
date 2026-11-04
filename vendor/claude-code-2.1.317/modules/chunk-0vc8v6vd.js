// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{gee,R6}from"./chunk-thp9mgjc.js";import{Xs}from"./chunk-nj8ddyrh.js";var r=[{pluginSource:`${R6}@${Xs}`,serverName:gee,title:"Claude Test (built into Claude Code)",personOnly:!0}];function jUo(i,n){return r.find((e)=>e.pluginSource===n&&e.serverName===i)?.title}function owt(i,n){return jUo(i,n)!==void 0}function Y8n(i,n){return r.some((e)=>e.personOnly&&e.serverName===i&&(!n||e.pluginSource===n))}function gpn(i,n,e,t){return e==="password"&&t.type==="string"&&!(("format"in t)&&t.format!==void 0)&&!("enum"in t)&&!("oneOf"in t)&&owt(i,n)}
export{jUo,owt,Y8n,gpn};
