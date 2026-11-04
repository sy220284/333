// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Bu,uF,f5,RB,oGe,dE,K_}from"./chunk-xkb87seb.js";var jCt="next";function Ate(e,s,r){let n=!1,i;return s.update(e,(t)=>{if(i=t,t.notified)return t;if(n=!0,r?.skipStampIfRunning&&t.status==="running")return t;return{...t,notified:!0}}),{claimed:n,task:i}}var Xkn=new RegExp(`^<${Bu}>\\n<${uF}>([^<]+)</${uF}>`+[f5,RB,oGe].map((e)=>`(?:\\n<${e}>[^<]*</${e}>)?`).join("")+`\\n<${dE}>`);function Ri({taskId:e,toolUseId:s,taskType:r,outputFile:n,status:i,summary:t,body:u,trailing:p}){let d=[[uF,e],[f5,s],[RB,r],[oGe,n],[dE,i],[K_,t]],o=`<${Bu}>`;for(let[a,T]of d)if(T)o+=`
<${a}>${T}</${a}>`;let f=(p??"").replaceAll(new RegExp(`<(?=\\s*/\\s*${Bu}\\b)`,"gi"),"&lt;");return`${o}${u??""}
</${Bu}>${f}`}
export{jCt,Ate,Xkn,Ri};
