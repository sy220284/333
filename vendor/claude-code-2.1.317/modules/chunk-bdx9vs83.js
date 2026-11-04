// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ie,qo}from"./chunk-y9ysdmh2.js";import{br}from"./chunk-dbgyrqyp.js";var bun={};br(bun,{booleanOfInput:()=>Ret,default:()=>bun,isHeldTrue:()=>oBr,numberInputHint:()=>yun,numberOfInput:()=>_un});var Ret=(n)=>Ie(n)?!0:qo(n)?!1:void 0;var oBr=(n)=>n===!0||n==="true";function yun(n){return`It takes a number${n.min!==void 0||n.max!==void 0?` between ${n.min??"-\u221E"} and ${n.max??"\u221E"}`:""}.`}function _un(n,e){let r=n.trim(),t=Number(r);return r!==""&&Number.isFinite(t)&&(e.min===void 0||t>=e.min)&&(e.max===void 0||t<=e.max)?t:void 0}export{Ret,oBr,yun,_un,bun};
