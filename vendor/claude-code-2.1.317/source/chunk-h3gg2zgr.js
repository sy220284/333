// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{je}from"/$bunfs/root/chunk-m2dj5b5f.js";import{Kg,Pks}from"/$bunfs/root/chunk-1dza7qzz.js";import{ehi}from"/$bunfs/root/chunk-bp2n1vns.js";function kcn(a,t){return ehi(a,(e)=>e.replace(/\.jsonl$/,t),(e)=>{if(e.namespace!=="transcript"||e.agentId===void 0)return;let n=["subagents",...e.agentRelPath??[],`agent-${e.agentId}${t}`],r=je.sidecar(e.projectKey,e.sessionId,n);return n.length<=Pks&&Kg(r)===void 0?r:void 0})}
export{kcn};
