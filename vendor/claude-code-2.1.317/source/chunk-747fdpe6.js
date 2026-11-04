// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{es}from"/$bunfs/root/chunk-sctdt2my.js";var x=/^\s*<tool_use_error>([\s\S]*)<\/tool_use_error>\s*$/i,f=/<\/?tool_use_error\b/i;function hi(n,e){if(!n.trim()||!e.trim())return null;let g=es(e),l=new RegExp(`<${g}(?=[\\s>])`,"gi"),o=new RegExp(`<\\/${g}>`,"gi"),s=0;for(;;){l.lastIndex=s;let t=l.exec(n);o.lastIndex=s;let i=o.exec(n);if(!t||!i)return null;let c=n.indexOf(">",t.index+t[0].length);if(c===-1)return null;o.lastIndex=c+1;let r=o.exec(n);if(!r)return null;let u=i.index+i[0].length<=t.index,d=n.slice(c+1,r.index);if(d&&!u)return d;s=r.index+r[0].length}}function MSn(n){let e=x.exec(n)?.[1];return e!==void 0&&!f.test(e)?e:void 0}
export{hi,MSn};
