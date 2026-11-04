// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function Ma(t,i){let e=0,r=[];function s(){if(e<t)return e++,Promise.resolve();return new Promise((n)=>r.push(n))}function o(){let n=r.shift();if(n)n();else e--}return async(...n)=>{await s();try{return await i(...n)}finally{o()}}}function Nbi(t,i,e){let r=Ma(t,e);return async(s)=>r(s,await i(s))}function KRt(t){let i=Ma(t,(e)=>new Promise((r)=>e(r)));return{acquire:()=>new Promise((e)=>void i(e))}}
export{Ma,Nbi,KRt};
