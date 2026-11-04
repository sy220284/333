// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{TZn,fKo}from"./chunk-thp9mgjc.js";import{randomUUID as n}from"crypto";function J2e(t){let e=fKo(t,TZn(t,t));return e===null?t:[...t,r(e)]}var PNo=(t)=>r(fKo(t,TZn(t,t))??{type:"session_cron_carry",tasks:[]}),r=(t)=>({attachment:t,type:"attachment",uuid:n(),timestamp:new Date().toISOString()});
export{J2e,PNo};
