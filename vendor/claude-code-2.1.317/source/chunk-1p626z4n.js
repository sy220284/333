// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Hl}from"/$bunfs/root/chunk-aqhsn9c5.js";import{x,Be}from"/$bunfs/root/chunk-dbgyrqyp.js";var d=x(function(i){Object.defineProperty(i,"__esModule",{value:!0});i.getMachineId=void 0;var t=Be("fs"),r=Hl();async function s(){let c=["/etc/machine-id","/var/lib/dbus/machine-id"];for(let a of c)try{return(await t.promises.readFile(a,{encoding:"utf8"})).trim()}catch(e){r.diag.debug(`error reading machine id: ${e}`)}return}i.getMachineId=s});export default d();
