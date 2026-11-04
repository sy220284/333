// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Q}from"/$bunfs/root/chunk-k4p8c4ay.js";import{fo,Uc}from"/$bunfs/root/chunk-y1has5v0.js";import{Nme}from"/$bunfs/root/chunk-nygnzbzy.js";import{Ka}from"/$bunfs/root/chunk-7nh5404d.js";function BQr(o,e){if(o.type!=="pending")return!1;let n=fo(o.name);return!e.some((t)=>Uc(t,o.name,n))}async function jQr(o,e,n){let{maxWaitMs:t,until:s,pollMs:l=50}=n,i=(r)=>r.clients.some((c)=>e(c,r));if(!i(o()))return;let p=Date.now()+t;while(Date.now()<p){await Q(l);let r=o();if(s?.(r)||!i(r))return}}function ves(o){return o.some(uIe)}function uIe(o){return"role"in o.config&&o.config.role==="comms"}function pRt(o){return o.mcpInfo?.role==="comms"}function fIe(o){if(Ka())return o.filter((e)=>!pRt(e));return o}async function lat(o){if(!Ka())return;await jQr(o,(e,n)=>BQr(e,n.tools)&&!uIe(e),{maxWaitMs:Nme})}
export{BQr,jQr,ves,uIe,pRt,fIe,lat};
