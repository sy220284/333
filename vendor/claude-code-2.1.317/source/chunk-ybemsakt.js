// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ee}from"/$bunfs/root/chunk-f95bhbz8.js";import{df,TB}from"/$bunfs/root/chunk-bjevk2dr.js";import{yes,Kwe,DU,uRt}from"/$bunfs/root/chunk-n448vdbc.js";function IGt(){let n=df();return n?{entrypoint:n.toLowerCase().slice(0,64)}:{}}function AGr(){let n=yes();return n&&!TB()?{session_id:n}:{}}var Wjo=3600000;function MXn(){let n=ee().sessionHintsRefusedAt;if(n!==void 0&&Date.now()-n<Wjo)return{};return{...IGt(),...AGr()}}function DXn(){ee().sessionHintsRefusedAt=Date.now()}var CGr=["entrypoint","session_id","request_id"],u=new Set(CGr);function LXn(n,s,i){let o=CGr.filter((t)=>i[t]!==void 0);if(n!==400||o.length===0)return[];let e=DU(s);if(!Kwe.test(e))return[];let r=o.filter((t)=>uRt(e,t));if(r.length>0)return r;return Object.keys(i).some((t)=>!u.has(t)&&uRt(e,t))?[]:o}function ngn(n){return n.includes("entrypoint")||n.includes("session_id")}function C8s(n){let{entrypoint:s,session_id:i,request_id:o,...e}=n;return e}
export{IGt,AGr,Wjo,MXn,DXn,CGr,LXn,ngn,C8s};
