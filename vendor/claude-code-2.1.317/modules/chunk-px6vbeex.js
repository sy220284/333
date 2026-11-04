// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{iO,xee}from"./chunk-thp9mgjc.js";import{mr}from"./chunk-mf6cjfte.js";function rfe(t,e){if(e)return t?`agent:builtin:${t}`:"agent:default";return t?`agent:custom:${t}`:"agent:custom"}function uet(){let e=mr()?.outputStyle??iO;if(e===iO)return"repl_main_thread";return Object.hasOwn(xee,e)?`repl_main_thread:outputStyle:${e}`:"repl_main_thread:outputStyle:custom"}
export{rfe,uet};
