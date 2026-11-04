// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Kd}from"./chunk-xkb87seb.js";import{lOe}from"./chunk-54967b2h.js";var Jw="EnterPlanMode";var Xis="PostCompact [",W6e="This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.";function r(o){return o.startsWith(`<${Kd}>`)&&o.includes(Xis)}function axn(o){if(typeof o==="string")return r(o);if(!Array.isArray(o)||o.length!==1)return!1;let t=o[0];return lOe(t)&&r(t.text)}
export{Jw,Xis,W6e,axn};
