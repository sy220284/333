// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{dZ}from"/$bunfs/root/chunk-y9ysdmh2.js";function c0(t,e){return(r)=>t((S)=>c(S,e,S[e],r(S[e])))}function MIn(t){return(e)=>t((r)=>{let S=e(r);return Object.is(S,r)?r:{...r,...S}})}function I_r(t){return{getSnapshot:t.getSnapshot,getState:t.getState,setState:MIn(t.setState),subscribe:t.subscribe}}function $Oe(t,e,r){return{get:()=>t()[r],set:c0(e,r)}}function oct(t,e){return(r,S)=>({get:()=>r()[t]??e,set:(a)=>S((s)=>{let n=s[t]??e;return c(s,t,n,a(n))})})}function RPi(t){let e=t;return{get:()=>e,set:(r)=>{e=r(e)}}}function bs(t,e){let r=t,S=new Set,a=e&&dZ(e),s=()=>r;return{getSnapshot:s,getState:s,setState:(n)=>{let o=r,i=n(o);if(Object.is(i,o))return;r=i,a?.({newState:i,oldState:o});for(let u of S)u()},subscribe:(n)=>{let o=dZ(n);return S.add(o),()=>S.delete(o)}}}function c(t,e,r,S){return Object.is(S,r)?t:{...t,[e]:S}}
export{c0,MIn,I_r,$Oe,oct,RPi,bs};
