// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"./chunk-jdmxbspc.js";import{t}from"./chunk-qx8w2w8f.js";import{vt,ue}from"./chunk-yx0yvz1d.js";import{_G,cFe,px,bG}from"./chunk-ttn3wae7.js";import{xa}from"./chunk-s2hz1q91.js";var jOr="https://clau.de/chrome/permissions",m={install:_G,reconnect:cFe,permissions:jOr};async function v6i({mcpClients:s,atStartup:a}){let l=await bG().catch((e)=>(t(`[Claude in Chrome] Extension detection failed: ${e instanceof Error?e.message:String(e)}`,{level:"error"}),!1)),o=ue(),r=s.some((e)=>e.name===xa&&e.type==="connected"),n=o.chromeExtension?.pairedDeviceName;return{allowed:px(),subscriber:vt(),wsl:i.isWslEnvironment(),installed:l,connected:r,...r&&n&&{paired_browser:n},enabled_by_default:o.claudeInChromeDefaultEnabled??!1,at_startup:await a(o.claudeInChromeDefaultEnabled===!0),urls:{...m}}}
export{jOr,v6i};
