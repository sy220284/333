// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{d}from"/$bunfs/root/chunk-5x4vp4dg.js";import{qo}from"/$bunfs/root/chunk-y9ysdmh2.js";import{_,t}from"/$bunfs/root/chunk-qx8w2w8f.js";import{Fn}from"/$bunfs/root/chunk-vfabxspf.js";import{RRe}from"/$bunfs/root/chunk-73zy5p6b.js";import{ECi}from"/$bunfs/root/chunk-qkn1dsar.js";import{unlinkSync as s}from"fs";import{mkdir as c}from"fs/promises";import{join as i}from"path";function DWo(){return i(ECi(),"claude","locks")}function UGt(){return!qo(void 0)}async function EJn(){let r=RRe(process.execPath);if(r===void 0||!UGt())return;try{let o=DWo(),e=i(o,`${r}@${process.pid}.lock`),n={pid:process.pid,version:r,execPath:process.execPath,acquiredAt:Date.now()};await c(o,{recursive:!0}),await Fn(e,_(n,null,2)),process.on("exit",()=>{try{s(e)}catch{}})}catch(o){t(`Could not write this process's version lock, so a later update may delete the app bundle it runs from: ${d(o)}`,{level:"warn"})}}
export{DWo,UGt,EJn};
