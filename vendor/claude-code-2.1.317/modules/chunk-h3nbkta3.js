// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{k}from"./chunk-5x4vp4dg.js";import{W}from"./chunk-agahg8zh.js";import{P}from"./chunk-tkwtwx7k.js";var s=268435456,Rhi=s;async function xhi(n,e,t){let r=0;while(r<e.byteLength){let{bytesWritten:i}=await n.write(e,r,e.byteLength-r,t===null?null:t+r);if(i<=0)throw Object.assign(Error("write made no progress"),{code:"EIO"});r+=i}}var a=new Set(["EPERM","ENOTSUP","EOPNOTSUPP","ENOSYS"]);class o{logged=!1;claim(){if(this.logged)return!1;return this.logged=!0,!0}}var K=new W(()=>new o);function Phi(n){let e=k(n);if(e===void 0)return!1;return a.has(e)||e==="EISDIR"&&P()==="windows"}
export{Rhi,xhi,Phi};
