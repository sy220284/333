// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Gv}from"./chunk-q0j77z7t.js";import{et,_oe}from"./chunk-sctdt2my.js";function $Qo(n){return n.birthtimeNs>0n&&n.birthtimeNs!==n.ctimeNs?n.birthtimeNs.toString():void 0}function i(n){return n>=-(2n**63n)&&n<-1n?n+2n**64n:n}function Pkn(n,t){return i(n)===i(t)}function e(n){return _oe(et(n,".")," ")}function FQo(n){return/^con(in|out)\$$/i.test(e(n))}var o=/[<>"|?*\\\x00-\x1f]/;function shi(n){return n.split("/").some((t)=>o.test(t))}function Xlr(n){return n.split("/").some((t)=>t.includes(":")||t.endsWith(".")||t.endsWith(" ")||Gv(e(t).replace(/ {2,}/g," "))||FQo(t))}var r=/^[^.]{1,6}~\d+(\.[^.]{1,3})?$/;function s(n){return _oe(et(n,":"),". ")}function Ikn(n){return n.split("/").some((t)=>r.test(s(t)))}
export{$Qo,Pkn,FQo,shi,Xlr,Ikn};
