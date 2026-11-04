// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{K,p_}from"./chunk-wxyh2ndv.js";import{b,f}from"./chunk-hd335g9m.js";import{a}from"./chunk-sqwfq8wd.js";import{c}from"./chunk-5s4g6bgt.js";import{kRn,ale,Xss,TRn}from"./chunk-0ev7jdfk.js";function dxo(l,s,d,i){let e=kRn(l),r=e!==null?TRn():null,n=r?.code==="hooks_held"?null:r;if(n!==null)c("goal_set",n.code,{origin:f("restored")});let t;if(e===null||n!==null){if(s((o)=>(t=o.activeGoal,o.activeGoal===void 0?o:{...o,activeGoal:void 0})),t!==void 0)ale(t,"resume_swap");return}if(d.add(K(),"Stop","",Xss(e)),s((o)=>(t=o.activeGoal,{...o,activeGoal:{condition:e,iterations:i?.iterations??0,setAt:i?.setAt??Date.now(),...i?.lastReason!==void 0&&{lastReason:i.lastReason},origin:"restored",tokensAtStart:p_()}})),t!==void 0)ale(t,"resume_swap");a("tengu_goal_restored_on_resume",{promptLength:e.length}),a("tengu_stop_hook_added",{promptLength:e.length,via:b("goal"),origin:f("restored")})}
export{dxo};
