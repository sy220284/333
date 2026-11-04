// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
class Vet extends Error{label;timeoutMs;constructor(e,r){super(`${e} timed out after ${r}ms`);this.label=e;this.timeoutMs=r;this.name="BoundedTimeoutError"}}async function td(e,r,n){let t,o=new Promise((c,i)=>{t=setTimeout((s,u,m)=>s(new Vet(u,m)),Math.min(r,2147483647),i,n,r)});try{return await Promise.race([e,o])}finally{if(t)clearTimeout(t);e.catch(()=>{})}}var sfn=5000;function nb(e,r){return td(e,sfn,`[runner:stuck] fs op '${r}' (check TMPDIR mount health)`)}
export{Vet,td,sfn,nb};
