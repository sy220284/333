// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{qo}from"/$bunfs/root/chunk-y9ysdmh2.js";var g=/^[A-Za-z0-9][A-Za-z0-9-]*$/,a=new Set(["restricted"]),Z$s=["system-prompt-file","append-system-prompt-file","append-subagent-system-prompt-file"];function UC(t,e){return`${t}=${e}`}function HDr(t,e){let n=String(e);if(n.length>1&&n.startsWith("-"))return[UC(t,n)];return[t,n]}function jin(t,e,n){t.push(...HDr(`--${e}`,n))}function jGn(t,e,n,o){let i=0;for(let[r,s]of Object.entries(e)){if(!g.test(r)){o("malformed",JSON.stringify(r));continue}if(n.has(r)){o("blocked",r);continue}if(a.has(r)){if(!qo(String(s)))t.push(`--${r}`),i++;continue}if(s!=="")jin(t,r,s),i++}return i}
export{Z$s,UC,HDr,jin,jGn};
