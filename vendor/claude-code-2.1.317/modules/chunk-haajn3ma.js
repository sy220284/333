// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var _gn=3000;function d(t){t.cancel().catch(()=>{})}async function Nq(t,{maxBytes:o=65536,timeoutMs:i}={}){let e;try{let n=t.body?.getReader();if(!n)return;if(i!==void 0)e=setTimeout(d,i,n),e.unref?.();let r=o;for(;;){let{done:a,value:c}=await n.read();if(a)return;if(r-=c.byteLength,r<0){await n.cancel();return}}}catch{}finally{if(e!==void 0)clearTimeout(e)}}
export{_gn,Nq};
