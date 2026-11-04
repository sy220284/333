// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ce,I,y,j}from"/$bunfs/root/chunk-3j5jca5v.js";j();function gh(r){let[t,n]=y({attempts:0,refused:null}),s=ce((e)=>{n((a)=>({attempts:a.attempts+1,refused:e}))},[]),u=ce((e)=>{if(r(e)===!1)return s(e),!1;return!0},[r,s]);return I(()=>{if(t.refused!==null)n((e)=>({attempts:e.attempts,refused:null}))},[t.refused]),{answer:u,refuse:s,refused:t.refused,attempts:t.attempts}}
export{gh};
