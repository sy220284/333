// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Pe,ue}from"/$bunfs/root/chunk-yx0yvz1d.js";import{l}from"/$bunfs/root/chunk-xkb87seb.js";import{L,ti}from"/$bunfs/root/chunk-kj64tv5d.js";var a=256;function SBs(e){let n=new Set(ti(ue().seenSecurityWarnings));return e.filter((r)=>r.seenKey===void 0||!n.has(r.seenKey))}function wBs(e,n){if(e.length===0)return;Pe((r)=>{let i=ti(r.seenSecurityWarnings),o=new Set(i),t=L(e).filter((s)=>!o.has(s));if(t.length===0)return r;return{...r,seenSecurityWarnings:[...i,...t].slice(-a)}},n)}async function qzn(){try{let[{getAllBaseTools:e},{collectPermissionRuleAdvisories:n},{loadAllPermissionRulesFromDisk:r}]=await Promise.all([import("/$bunfs/root/chunk-zmqrzdmj.js"),import("/$bunfs/root/chunk-p0j72a0j.js"),import("/$bunfs/root/chunk-0s3vvnjy.js")]);return L(n(r(),e).map((i)=>i.line))}catch(e){return l(e),[]}}
export{SBs,wBs,qzn};
