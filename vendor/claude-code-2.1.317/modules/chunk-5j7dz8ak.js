// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Oe}from"./chunk-y9ysdmh2.js";import{Ze}from"./chunk-wxyh2ndv.js";import{t}from"./chunk-qx8w2w8f.js";function u(){let r=Oe(),e=new Map,o=0;return{emit(i,s){if(o===0){e.set(i,s);return}r.emit(i,s)},subscribe(i){o++;let s=[...e];e.clear();for(let[g,l]of s)i(g,l);let c=r.subscribe(i),n=!0;return()=>{if(n)n=!1,o--,c()}}}}var EPr=new Ze(u),KNt="device-mcp-not-now";function g1n(r){return(e,o)=>{t(`[remote-tools] ${e}: ${o}`),EPr.of(r).emit(e,o)}}
export{EPr,KNt,g1n};
