// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Fi}from"/$bunfs/root/chunk-nj8ddyrh.js";import{dEr}from"/$bunfs/root/chunk-fnzgktb2.js";function Ltt(t){let r=[];for(let o of t){if(!Fi(o))continue;let{config:e}=o,n=e&&typeof e==="object"&&"url"in e&&typeof e.url==="string"?e.url:null;if(n!==null&&dEr(n))r.push(o)}return r.length===1?r[0]:null}
export{Ltt};
