// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Eu,dk}from"/$bunfs/root/chunk-yx0yvz1d.js";import{Uw}from"/$bunfs/root/chunk-thp9mgjc.js";function o(e){let t=Eu(e);return t===Eu("")?"(unnamed agent)":t}function r(e,t,i){return`${o(e)} agent: ${dk(t,i)}`}function s(e,t,i){return{type:"notification",notification:{key:`agent-model-restricted-${o(e)}-${Eu(t)}`,text:r(e,t,i),priority:"medium",color:"warning",timeoutMs:1e4}}}function P4n(e,t){return(i,n)=>{t?.(s(e,i,n))}}function l0e(e,t){return(i,n)=>{t?.(Uw(r(e,i,n),"warning"))}}
export{P4n,l0e};
