// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{d}from"./chunk-5x4vp4dg.js";import{t}from"./chunk-qx8w2w8f.js";import{P}from"./chunk-tkwtwx7k.js";import{Mte,OD}from"./chunk-p9j1kqer.js";var e={disabled:"The Windows Secondary Logon service (seclogon) is disabled; an administrator must set its startup type to Manual (`sc.exe config seclogon start= demand`). The sandbox cannot start without it.",missing:"The Windows Secondary Logon service (seclogon) is not present on this machine; the sandbox cannot start without it."};function SJn(n){return n?.seclogon==="disabled"||n?.seclogon==="missing"?e[n.seclogon]:void 0}async function wJn(){if(P()!=="windows")return;let n=await Mte({srtWin:OD()}).catch((o)=>{t(`[sandbox] could not read the sandbox status: ${d(o)}`,{level:"error"});return});return SJn(n?.user)}
export{SJn,wJn};
