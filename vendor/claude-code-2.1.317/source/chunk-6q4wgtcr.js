// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{EC}from"/$bunfs/root/chunk-jp6k4gr0.js";import{h0,v}from"/$bunfs/root/chunk-yx0yvz1d.js";import{ixt}from"/$bunfs/root/chunk-46rwvs73.js";import{isDeepStrictEqual as c}from"util";function IUo(){return i.CLAUDE_CODE_CCR_OWN_CONNECTION_POOL||v("tengu_reactive_quilt",!1)}async function u8n(t,e={}){if(e.proxy!==void 0||h0()!=="hosted_worker"||!IUo())return fetch(String(t),e);let r=EC(void 0).tls;if(c(e.tls,r))return ixt(String(t),e,()=>!0);let o=new Set([r?.ca??[]].flat()),n=[e.tls?.ca??[]].flat().filter((s)=>o.has(s));if(n.length===0)throw Error("MCP request not sent: its list of trusted CA certificates has nothing in common with the one Claude Code uses now, most likely because Claude Code's TLS settings changed after the server connected. Reconnect the server to use the new settings.");return fetch(String(t),{...e,tls:{...r,ca:n}})}
export{IUo,u8n};
