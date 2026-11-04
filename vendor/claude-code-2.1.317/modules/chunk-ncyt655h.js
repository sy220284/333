// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{eKr}from"./chunk-thp9mgjc.js";import{t}from"./chunk-qx8w2w8f.js";import{kp,na}from"./chunk-jp6k4gr0.js";import{BMe}from"./chunk-85g16xpf.js";import{readFile as p}from"fs/promises";async function zCe(r){if(eKr()?.serves?.(r))return{...na({url:r}),proxy:!1,redirect:"error"};if(!kp()){let e=BMe();if(e.HTTPS_PROXY&&URL.parse(r)?.protocol==="https:"){let n={url:e.HTTPS_PROXY,noProxy:e.NO_PROXY},i=na({url:r,fallbackProxy:n});if(i.proxy===void 0||!e.SSL_CERT_FILE)return i;let a;try{a=await p(e.SSL_CERT_FILE,"utf8")}catch(o){t(`MCP agent-proxy fallback: failed to read CA bundle: ${o instanceof Error?o.message:String(o)}`,{level:"warn"})}return na({url:r,fallbackProxy:{...n,ca:a}})}}return na({url:r})}
export{zCe};
