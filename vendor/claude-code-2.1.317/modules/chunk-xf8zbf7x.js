// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{MPn}from"./chunk-zwtf5rhy.js";import{Hl}from"./chunk-aqhsn9c5.js";import{x}from"./chunk-dbgyrqyp.js";var o=x(function(c){Object.defineProperty(c,"__esModule",{value:!0});c.getMachineId=void 0;var i=MPn(),n=Hl();async function u(){try{let t=(await i.execAsync('ioreg -rd1 -c "IOPlatformExpertDevice"')).stdout.split(`
`).find((d)=>d.includes("IOPlatformUUID"));if(!t)return;let r=t.split('" = "');if(r.length===2)return r[1].slice(0,-1)}catch(e){n.diag.debug(`error reading machine id: ${e}`)}return}c.getMachineId=u});export default o();
