// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{_}from"/$bunfs/root/chunk-qx8w2w8f.js";import{M,ne}from"/$bunfs/root/chunk-sctdt2my.js";import{basename as c,resolve as E}from"path";var h=100,l=900,a=300;function xse(t){return _(t).replace(/[^\x20-\x7e]/g,(e)=>`\\u${e.charCodeAt(0).toString(16).padStart(4,"0")}`)}function Y1r(t){let e=xse(t);if(e.length<=a)return e;let n=[...t],r=n.length,i=5;while(r>0){if(i+=xse(n[r-1]).length-2,i>a)break;r--}return xse(`...${n.slice(r).join("")}`)}function J5s(t){let e=[],n=0;for(let{path:i,name:o,size:g}of t){let s=`${Y1r(i)}${c(i)===o?"":`, the file ${Y1r(o)}`} (${g} bytes)`;if(n+=s.length+2,n>l)break;e.push(s)}let r=t.length-e.length;return`Attaches ${t.length} ${M(t.length,"file")}: ${e.join("; ")}${r>0?`; and ${r} more`:""}`}function Q5s(t){if(t==="")return;let e=t.slice(1).split("/").map((n)=>n.replaceAll("~1","/").replaceAll("~0","~")).map((n,r)=>r===0?n:/^\d+$/.test(n)?`[${n}]`:`.${n}`).join("");return KZ(e)}function KZ(t){return xse(t.length>h?`${ne(t,h)}...`:t)}
export{xse,Y1r,J5s,Q5s,KZ};
