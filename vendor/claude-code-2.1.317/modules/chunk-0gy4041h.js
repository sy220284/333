// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"./chunk-qx8w2w8f.js";import{gdo,Gms,xj,wn}from"./chunk-yx0yvz1d.js";import{Uve}from"./chunk-xa1bswzd.js";import{createHash as g}from"crypto";function dZe(){let{value:e,source:r}=wn(Uve,null);return{flag:n(e),source:r}}function n(e){let{flag:r,problem:o}=gdo(e);if(o!==void 0)t(`org-config gate: ${Uve} is malformed (${o}); treating as off`,{level:"warn"});return r}async function CCo(e,r,o){let a=await Gms(Uve,null,e,r,o);return a.served?{flag:n(a.value),source:"payload"}:void 0}function n3i(e=dZe,r=xj){let{flag:o,source:a}=e();return o.enabled||a==="fallback"&&r()}function RCo(e){let r=g("sha256").update(`org_config_gate:${e}`).digest("hex");return parseInt(r.slice(0,8),16)%100}function xCo(e,r){return e.enabled&&r<e.percent}
export{dZe,CCo,n3i,RCo,xCo};
