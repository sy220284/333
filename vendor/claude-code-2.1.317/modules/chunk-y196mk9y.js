// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{_,te}from"./chunk-qx8w2w8f.js";var sAt=0,vor=1,ywn=262144,n=5,_wn=1048576,Z$e=1e4;function bwn(r){let e=typeof r==="string"?Buffer.from(r,"utf8"):r,t=Buffer.allocUnsafe(n+e.length);return t.writeUInt32BE(e.length,0),t.writeUInt8(sAt,4),e.copy(t,n),t}function T1(r){let e=Buffer.from(_(r),"utf8"),t=Buffer.allocUnsafe(n+e.length);return t.writeUInt32BE(e.length,0),t.writeUInt8(vor,4),e.copy(t,n),t}function kor(r,e){let t=Buffer.alloc(0),o=!1;return(l)=>{if(o)return;t=t.length===0?l:Buffer.concat([t,l]);while(t.length>=n){let f=t.readUInt32BE(0);if(f>_wn){o=!0,e(`frame too large (${f} > ${_wn})`);return}let u=n+f;if(t.length<u)return;let i=t.readUInt8(4),s=t.subarray(n,u);if(t=t.subarray(u),i===sAt)r({kind:sAt,payload:Buffer.from(s)});else if(i===vor){let c;try{c=te(s.toString("utf8"))}catch{o=!0,e("bad ctrl json");return}r({kind:vor,ctrl:c})}else{o=!0,e(`unknown frame kind ${i}`);return}}}}
export{sAt,vor,ywn,_wn,Z$e,bwn,T1,kor};
