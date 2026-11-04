// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{fr}from"./chunk-gjbaq629.js";import{sc}from"./chunk-eb23pzbj.js";function Yo(r,a){let{signalB:o,timeoutMs:i,refTimer:d}=a??{},n=fr();if(r?.aborted||o?.aborted)return n.abort(),{signal:n.signal,cleanup:()=>{}};let e,t=()=>{if(e!==void 0)clearTimeout(e);n.abort()};if(i!==void 0){if(e=setTimeout(t,Math.min(i,sc)),!d)e.unref?.()}r?.addEventListener("abort",t),o?.addEventListener("abort",t);let m=()=>{if(e!==void 0)clearTimeout(e);r?.removeEventListener("abort",t),o?.removeEventListener("abort",t)};return{signal:n.signal,cleanup:m}}
export{Yo};
