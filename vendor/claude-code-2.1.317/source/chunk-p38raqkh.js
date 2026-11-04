// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{x}from"/$bunfs/root/chunk-dbgyrqyp.js";var a=x(function(u){function c(t){let r={};if(t=t.replace(/^\?/,""),t)for(let n of t.split("&")){let[e,s=null]=n.split("=");if(e=decodeURIComponent(e),s)s=decodeURIComponent(s);if(!(e in r))r[e]=s;else if(Array.isArray(r[e]))r[e].push(s);else r[e]=[r[e],s]}return r}u.parseQueryString=c});var rY=x(function(y){var l=a(),i=(t)=>{if(typeof t==="string")return i(new URL(t));let{hostname:r,pathname:n,port:e,protocol:s,search:o}=t,p;if(o)p=l.parseQueryString(o);return{hostname:r,port:e?parseInt(e):void 0,protocol:s,path:n,query:p}};y.parseUrl=i});
export{rY};
