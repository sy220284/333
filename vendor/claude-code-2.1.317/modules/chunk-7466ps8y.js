// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{QV}from"./chunk-wxyh2ndv.js";import{v,kY}from"./chunk-yx0yvz1d.js";import{i}from"./chunk-jdmxbspc.js";import{Bp,lft}from"./chunk-7m911gj4.js";import{yYe,l7o}from"./chunk-6a8qge18.js";var t=300000;function Gar(){return i.CLAUDE_CODE_BRIEF||kY("tengu_kairos_brief",!1,t)}function rJi(e){if(!e.includes(Bp)&&!e.includes(lft))return!1;if(yYe())return!1;return Gar()}function LH(){return QV()&&Gar()||l7o()}var r=`In brief mode, plain assistant text is hidden from the user \u2014 only ${Bp} reaches them. Call it now with your substantive reply for this turn. Do not mention this reminder; the message should read as if you wrote it unprompted, addressing only what the user actually asked. If you genuinely have nothing useful to tell the user, you may end the turn without calling it.`;function oJi(){let e=v("tengu_kairos_brief_stop_hook_text","");return typeof e==="string"&&e.length>0?e:r}
export{Gar,rJi,LH,oJi};
