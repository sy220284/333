// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ot}from"./chunk-sctdt2my.js";import{Tp}from"./chunk-qx8w2w8f.js";import{Fpt}from"./chunk-1dza7qzz.js";import{M8}from"./chunk-0ftpbvta.js";var bp="MEMORY.md",l0=200,$7=25000,pao=4*$7,l1e=200,Yge=4096;function d1e(t){let r=t.trim();return{trimmed:r,lineCount:Ot(r,`
`)+1,byteCount:r.length}}function d0(t){return t.normalize("NFC").toLowerCase()}function aY(t){let r=t?.lastIndexOf("/")??-1;if(r<=0)return"";let n=t.slice(0,r+1);return n.split("/").some((e)=>e.startsWith("."))?"":n}var X3e="This directory already exists \u2014 write to it directly with the Write tool (do not run mkdir or check for its existence).",mao="Both directories already exist \u2014 write to them directly with the Write tool (do not run mkdir or check for their existence).";function vj(t){let r="";for(let n of Fpt(Tp(t.replace(/\r\n?|[\u2028\u2029]/g,`
`)))){let e=n.codePointAt(0),o=e!==9&&e!==10&&(e<32||e>=127&&e<=159);r+=o?"\uFFFD":n}return r}function Wle(t){return M8(s(t))}function k_r(t){return pOt(t)||/[\p{Cc}\u2028\u2029]/u.test(t)}function PIn(t){return Wle(t.replace(/[\t\n\r\u2028\u2029]/g,""))}var Xus=new Set([8204,8205,65038,65039]),i=/^[\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{DI}]$/u;function pOt(t){let r=t.codePointAt(0);if(Xus.has(r)||r===9||r===10||r===13)return!1;return i.test(t)||r<32||r>=127&&r<=159}function s(t){let r="";for(let n of t.replace(/\r\n?|[\u2028\u2029]/g,`
`)){if(pOt(n))continue;r+=n}return r}
export{bp,l0,$7,pao,l1e,Yge,d1e,d0,aY,X3e,mao,vj,Wle,k_r,PIn,Xus,pOt};
