// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{es}from"/$bunfs/root/chunk-sctdt2my.js";import{zt,N$,ske,Dv}from"/$bunfs/root/chunk-7bsarx3n.js";function OZo(t){return"  "+t.replace(YYe,`
`).split(`
`).join(`
  `)}var MZo=IU,YYe=/\r\n?|[\u001c-\u001e\u2028\u2029\u0085\v\f]/g;function XYe(t){return t.replace(YYe,`
`)}var tIe=/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu,{open:e,close:s,slash:i}=N$;function k5t(t,r){return r.replace(tIe,"").replace(new RegExp(`[${e}]([\\s${i}]*${es(t)}\\b(?:${ske(`^${e}${s}`,2)}[${s}])?)`,"giu"),(n,o)=>"["+o)}var T5t="forwarded_user_turns",iUe="forwarded_turn",p=["transcript",T5t,iUe];function Uit(t){let r=t;for(let n of p)r=k5t(n,r);return r}function IU(t){return"  "+Uit(XYe(t)).split(`
`).join(`
  `)}var a=/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;function N7r(t){return OZo(zt(Dv(XYe(t).replace(tIe,"").replace(a,""))))}
export{OZo,MZo,YYe,XYe,tIe,k5t,T5t,iUe,Uit,IU,N7r};
