// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Do,le}from"./chunk-qx8w2w8f.js";import{sF}from"./chunk-vfabxspf.js";import{eo,Xre,d9,Xc}from"./chunk-sr539zbq.js";import{Jb,Zj}from"./chunk-1dza7qzz.js";import{Ht}from"./chunk-swzk22rx.js";import{randomBytes as f}from"crypto";import{constants as a}from"fs";import{mkdir as p,writeFile as w}from"fs/promises";import{basename as l,dirname as E,join as n}from"path";var _="tengu_mossy_knuth";async function ysn(t,i,r,o){let e=Xc();if(!Ht(_,{safe:!0})){let m=o?n(e,o):e;await p(m,{recursive:!0,mode:448});let c=n(m,`${t}${Date.now()}${i}`);return await w(c,r),c}await p(e,{recursive:!0,mode:448}),d9(e);let s=n(Do(le(),E(e)).resolvedPath,l(e),`${t}${f(8).toString("hex")}${i}`);return await Wvo(s,r),s}async function Wvo(t,i){let r=await Jb(t,[t],{leaf:"replace"});try{await r.recheckBeforeWrite(),await sF(r.ioPath),await w(r.ioPath,i,{mode:384,flag:a.O_WRONLY|a.O_CREAT|a.O_EXCL|eo|Xre})}catch(o){Zj(o,r,t)}finally{await r.close()}}
export{ysn,Wvo};
