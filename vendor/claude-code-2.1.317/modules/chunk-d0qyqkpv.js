// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Scr}from"./chunk-0afpsfpt.js";import{Ysr,Xsr}from"./chunk-ttn3wae7.js";import{Yi}from"./chunk-aqhsn9c5.js";var f=30000;function NNt(i){let n=Yi(i??"");if(!n||Scr(n)||n===Ysr||n===Xsr)return;return n}function PSo(i,n,r,a){let e=new AbortController,s,d=(t)=>{if(e.signal.aborted||t===void 0||t===s)return;s=t,a(t)};if(n?.then(d,()=>{}),r===void 0)return()=>e.abort();let o=()=>{},u=()=>{r(e.signal).then(d,()=>{}).finally(()=>{if(!e.signal.aborted)o=i.setTimeout(u,f)})};return o=i.setTimeout(u,f),()=>{e.abort(),o()}}
export{NNt,PSo};
