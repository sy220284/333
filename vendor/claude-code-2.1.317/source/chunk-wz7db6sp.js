// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{wwe,Q2}from"/$bunfs/root/chunk-2f0spw97.js";function rr(e,r,o="foreground"){return(t)=>{if(!e)return t;if(e.startsWith("rgb(")||e.startsWith("#")||e.startsWith("ansi256(")||e.startsWith("ansi:"))return wwe(t,e,o);let i=typeof r==="string"?Q2(r):r;return wwe(t,i[e],o)}}
export{rr};
