// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ln}from"/$bunfs/root/chunk-d01ffsyh.js";import{Ne}from"/$bunfs/root/chunk-tm88cq46.js";import{Clt,zU}from"/$bunfs/root/chunk-3vjqe06z.js";function aon(i){if(i.toolName===Ne){if(!i.ruleContent)return{prefix:"Any Bash command"};if(i.ruleContent.endsWith(":*")||i.ruleContent.endsWith(" *"))return{prefix:"Any Bash command starting with ",emphasis:i.ruleContent.slice(0,-2)};return{prefix:"The Bash command ",emphasis:i.ruleContent}}if(zU(i))return{prefix:`This rule ${Clt(ln(i),i.toolName)}`};if(!i.ruleContent)return{prefix:"Any use of the ",emphasis:i.toolName,suffix:" tool"};return null}
export{aon};
