// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{em,b7}from"/$bunfs/root/chunk-1w9e8s6h.js";import{Mu}from"/$bunfs/root/chunk-y52m2tkd.js";import{Rlr}from"/$bunfs/root/chunk-17r0bh55.js";import{basename as o,sep as n}from"path";function r5s(s){let e=Mu(),{listedOwnerships:i}=e;i.clear(),e.listedSkillsAnswer="none_yet";for(let t of s){let l;try{l=em(o(b7(t.name,n)))}catch{continue}if(!i.has(l))i.set(l,{listedName:t.name,ownership:Rlr(t),savedFromAChat:typeof t.backing_plugin_id==="string"})}e.listedSkillsAnswer="a_list",e.lastRoundCouldNotAsk=!1}function p1r(s){return Mu().listedOwnerships.get(em(s))}
export{r5s,p1r};
