// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{vu}from"/$bunfs/root/chunk-yx0yvz1d.js";import{ge}from"/$bunfs/root/chunk-s25vas16.js";var XOo=Object.freeze({isKept:!0,isDenied:!1,context:Object.freeze([])});function m(){let o=vu();return{setPromptMentionRunner:o.set,runPromptMention:(r)=>{let e=o.get();return e?e(r):r.read(r.raised,"unhooked").then(()=>XOo)}}}var t=ge(m(),(o)=>o.setPromptMentionRunner(null));var JGi=t.runPromptMention;var QGi=t.setPromptMentionRunner;export{XOo,JGi,QGi};
