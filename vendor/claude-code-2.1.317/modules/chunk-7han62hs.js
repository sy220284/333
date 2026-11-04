// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ks}from"./chunk-d3rsegc1.js";import{iM,Qi}from"./chunk-0nz48hvd.js";async function bon(n,i){if(await iM()===Ks)return{cleared:!1,reason:"credential_store_failed"};let c=import.meta.require("./chunk-rgyrdt8j.js").mcpAuthModule(),t=new Set,e={cleared:!0};for(let r of i){if(r.type!=="http"&&r.type!=="sse")continue;let a=Qi(n,r);if(t.has(a))continue;t.add(a);let o=await c.revokeServerTokens(n,r);if(!o.cleared&&(e.cleared||o.reason==="credential_store_failed"))e=o}if(!e.cleared&&e.reason==="credential_store_failed")return e;let s=await iM();if(s===Ks||[...t].some((r)=>s?.mcpOAuth?.[r]!==void 0))return{cleared:!1,reason:"credential_store_failed"};return e}
export{bon};
