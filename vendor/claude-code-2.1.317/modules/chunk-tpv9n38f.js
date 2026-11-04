// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{realpathSync as t}from"fs";import{cwd as e}from"process";function r_o(n){return n}function iOs(n){return n}function aOs(){let n="";if(typeof process<"u"&&typeof process.cwd==="function"&&typeof t==="function")try{let r=e();try{n=r_o(iOs(r))}catch{n=r_o(r)}}catch{}return n}var nUn=aOs(),vnn=(()=>{if(typeof process>"u"||typeof process.cwd!=="function")return null;try{return process.cwd()}catch{return null}})();function Y0t(){if(vnn===null)return null;let n=process.env.CLAUDE_CODE_SESSION_KIND;return n!==void 0&&String(n).trim()==="bg"?null:vnn}
export{r_o,iOs,aOs,nUn,vnn,Y0t};
