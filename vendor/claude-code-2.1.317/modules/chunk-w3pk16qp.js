// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"./chunk-qx8w2w8f.js";import{L}from"./chunk-kj64tv5d.js";function B0i(n){switch(n){case"hipaa":return"HIPAA";case"zdr":return"ZDR (Zero Data Retention)";default:return t(`Unknown compliance_taint '${n}' from policyLimits`,{level:"warn"}),r}}var r="Organization policy",ODt="Per your organization's policy, some features are limited",FEr="HIPAA configured",o=new Set(["hipaa","zdr"]);function mLn(n){return o.has(n)||!1}function gLn(n){let e=L(n),i=e.filter(mLn);if(i.length===e.length)return i;return t(`Unknown compliance_taint values from policyLimits (${e.length-i.length})`,{level:"warn"}),[...i,r]}var a=new Set(["hipaa"]);function Ode(n){return L(n).filter((e)=>a.has(e))}
export{B0i,ODt,FEr,mLn,gLn,Ode};
