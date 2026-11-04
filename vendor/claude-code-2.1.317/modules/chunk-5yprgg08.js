// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{K,Ytn}from"./chunk-wxyh2ndv.js";import{b,f}from"./chunk-hd335g9m.js";import{i}from"./chunk-jdmxbspc.js";import{Wpe,Dd,od,Eo,dl}from"./chunk-9w39wpj0.js";import{a}from"./chunk-sqwfq8wd.js";import{g}from"./chunk-5s4g6bgt.js";import{_e}from"./chunk-793x7kqw.js";import{Ut,Lve}from"./chunk-yx0yvz1d.js";import{tr}from"./chunk-thp9mgjc.js";import{fqn}from"./chunk-wv6vjrtj.js";function p(){return i.CLAUDE_JOB_DIR}async function uqn(n,e,s){a("tengu_bg_agent_action",{action:b("stop"),source:f(n),jobSessionId:_e(K())}),Ytn(void 0);let o=p();if(Ut()&&o){let r=new Date().toISOString(),t=await Eo(o,e);if(t&&!dl(t))await Dd(o,{...t,state:"stopped",detail:"stopped from session",tempo:"idle",needs:void 0,block:void 0,inFlight:void 0,updatedAt:r,firstTerminalAt:t.firstTerminalAt??r},e).catch(od);else await fqn(o,e);if(Lve())process.stdout.write(Wpe(s??"Session stopped."))}return g("job_stop_self"),tr(0,"prompt_input_exit",{suppressResumeHint:!0})}
export{uqn};
