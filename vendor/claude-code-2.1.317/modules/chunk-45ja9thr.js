// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{a9n,wKe}from"./chunk-nja28fb3.js";function Jcn(e,n){return{targets:e.filter((t)=>a9n(t,n)),outOfBandNote:wKe(e,!0,n)}}async function Qcn(e,n){let t=await Promise.allSettled(e.map((o)=>n(o.name))),r=0;for(let o of t)if(o.status==="fulfilled"&&o.value.client.type==="connected")r++;return{results:t,connected:r}}
export{Jcn,Qcn};
