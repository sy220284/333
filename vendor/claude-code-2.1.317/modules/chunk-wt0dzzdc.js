// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{MPn}from"./chunk-zwtf5rhy.js";import{Hl}from"./chunk-aqhsn9c5.js";import{x,Be}from"./chunk-dbgyrqyp.js";var u=x(function(n){Object.defineProperty(n,"__esModule",{value:!0});n.getMachineId=void 0;var r=Be("fs"),i=MPn(),t=Hl();async function c(){try{return(await r.promises.readFile("/etc/hostid",{encoding:"utf8"})).trim()}catch(e){t.diag.debug(`error reading machine id: ${e}`)}try{return(await i.execAsync("kenv -q smbios.system.uuid")).stdout.trim()}catch(e){t.diag.debug(`error reading machine id: ${e}`)}return}n.getMachineId=c});export default u();
