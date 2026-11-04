// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ZK,eV,db,i_,sh,tT}from"/$bunfs/root/chunk-yx0yvz1d.js";function n(){let e=db();if(e==="opus"&&ZK()&&!tT(i_()))return{alias:"opus[1m]",name:"Opus 1M",multiplier:5};else if(e==="sonnet"&&eV()&&!tT(sh()))return{alias:"sonnet[1m]",name:"Sonnet 1M",multiplier:5};return null}function ZAe(e){let t=n();if(!t)return null;switch(e){case"warning":return`/model ${t.alias}`;case"tip":return`Tip: You have access to ${t.name} with ${t.multiplier}x more context`;default:return null}}
export{ZAe};
