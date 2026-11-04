// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ui}from"/$bunfs/root/chunk-wxyh2ndv.js";import{yl}from"/$bunfs/root/chunk-gfgmnhge.js";import{Wks,tgo}from"/$bunfs/root/chunk-1dza7qzz.js";import{l}from"/$bunfs/root/chunk-xkb87seb.js";import{NLi}from"/$bunfs/root/chunk-aqhsn9c5.js";import{L}from"/$bunfs/root/chunk-kj64tv5d.js";async function coo(r){let e=L([ui(),yl()]).filter((t)=>t!==null);for(let t of e)try{let o=await Wks(r,t);if(o!==void 0){let i=await NLi(t,o.gitRoot,r);if(typeof i==="string")tgo(i,o.gitRoot,o.canonicalRoot)}}catch(o){l(o)}}
export{coo};
