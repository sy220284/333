// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{U}from"/$bunfs/root/chunk-wxyh2ndv.js";import{W}from"/$bunfs/root/chunk-agahg8zh.js";import{l}from"/$bunfs/root/chunk-xkb87seb.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{bm,Eo,_D}from"/$bunfs/root/chunk-9w39wpj0.js";var s="--inherit-permission-mode";function t(e){return e===s||e.startsWith(`${s}=`)}class m{mode}var u=new W(()=>new m);function f(){return u.of(U().host)}function DBs({inheritPermissionModeCli:e,resolvedMode:n,storageV5:r}){if(!e)return;f().mode=n,_D("--permission-mode",[s],n,void 0,r).catch((o)=>l(o))}async function LBs(e){let n=f(),r=n.mode;if(r===void 0)return;let o=i.CLAUDE_JOB_DIR;if(!o||i.CLAUDE_CODE_SESSION_KIND!=="bg"){n.mode=void 0;return}let d=await Eo(o,e);if(!d?.respawnFlags)return;if(!d.respawnFlags.some(t)){n.mode=void 0;return}await _D("--permission-mode",[s],r,void 0,e,void 0,(p)=>p.some(t)),bm(o);let a=await Eo(o,e);if(a?.respawnFlags&&!a.respawnFlags.some(t))n.mode=void 0}
export{DBs,LBs};
