// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"/$bunfs/root/chunk-c3q80g49.js";import{Xo}from"/$bunfs/root/chunk-b3wp3jfr.js";import{ey}from"/$bunfs/root/chunk-apgamq1r.js";var t="Claude wants to send this session\u2019s work to a Claude Project",r=Xo({kind:"permission_continue_in_projects",payload:p(()=>ey((e)=>typeof e==="object"&&e!==null&&("requestId"in e)&&("toolName"in e)&&("permissionResult"in e))),result:p(()=>ey((e)=>typeof e==="object"&&e!==null&&("behavior"in e))),default:{behavior:"cancelled"}});export{t as CONTINUE_NOTIFICATION,r as projectContinuePermissionDialog};
