// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ji}from"/$bunfs/root/chunk-26xg87f0.js";import{y,j}from"/$bunfs/root/chunk-3j5jca5v.js";j();var GM=150,go=250;var q9=600;function qi(e,t,n=GM){let o=e()-t;if(o>=0)return o<n;return t<=Date.now()}function iGn(e){let t=ji(),[n,o]=y(()=>({key:e,at:Date.now()}));if(n.key!==e)o({key:e,at:Date.now()});return function(){return qi(t,n.at)}}
export{GM,go,q9,qi,iGn};
