// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{d}from"/$bunfs/root/chunk-5x4vp4dg.js";import{z7t}from"/$bunfs/root/chunk-p4749k7j.js";import{kz,Jhe}from"/$bunfs/root/chunk-nb5we685.js";import{br}from"/$bunfs/root/chunk-dbgyrqyp.js";var oRo={};br(oRo,{default:()=>oRo,endsInARowOf:()=>vGi,unsettledBy:()=>nHr,workerEndingOf:()=>kGi});function vGi(e){let n=Number(e);return Number.isSafeInteger(n)&&n>0?n:0}var nHr=(e)=>({reason:`Error: ${d(e)}`,kind:e instanceof z7t?"passing":"lasting"});var o=5,m=`It did not pass in ${o} tries`,p="it is held for good, or refused to this process",t="Start the daemon again once this is mended.",a=`${m}: ${p}. ${t}`;function kGi(e,n){let r=e.kind==="passing",s=r&&n+1<o,i=r?a:t;return s?{code:Jhe,said:`${e.reason}
`}:{code:kz,said:`${e.reason}
${i}
`}}export{vGi,nHr,kGi,oRo};
