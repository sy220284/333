// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var Yun="you are not signed in, or this machine is not authorized to write to the session",$Ys="without your deny and ask rules";function FYs({completion:n,status:a,description:s=u,afterFirstReply:m=r}){let t;n.then((e)=>{t={outcome:e,atMs:Date.now()}});let d=m,o,l=new Promise((e)=>{o=e});return{completion:n,status:a,description:s,outcome:()=>t?.outcome,settledAtMs:()=>t?.atMs,async afterFirstReply(e){let i=d;if(d=null,i===null)return r();try{return await i(e,o)}finally{o(void 0)}},readBack:l}}function r(){return Promise.resolve("skipped")}function u(){return null}
export{Yun,$Ys,FYs};
