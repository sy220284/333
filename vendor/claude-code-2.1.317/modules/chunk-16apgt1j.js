// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{pn}from"./chunk-sxtzjrdg.js";import{hn}from"./chunk-26xg87f0.js";import{mn}from"./chunk-fj5sjhc9.js";import{ce,bt,j}from"./chunk-3j5jca5v.js";j();function UB(r,o,t=1000,n=0,a){let e=hn(),u=()=>pn(Math.max(0,(a??Date.now())-r-n)),l=ce((f)=>{if(!o)return()=>{};let i,s=()=>{try{f()}finally{i=e.setTimeout(s,t)}};return i=e.setTimeout(s,t),()=>i()},[o,t,e]);return bt(l,u,u)}function lq({onClose:r,onBack:o,onKill:t,onEnter:n}){return mn({"confirm:yes":n??r},{context:"Confirmation"}),function(e){if(e.key===" ")e.preventDefault(),r();else if(e.key==="left"&&o)e.preventDefault(),o();else if(e.key==="x"&&!e.ctrl&&!e.meta&&t)e.preventDefault(),t()}}
export{UB,lq};
