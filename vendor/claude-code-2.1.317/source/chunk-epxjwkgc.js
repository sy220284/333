// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{c$n}from"/$bunfs/root/chunk-b2vjkcry.js";import{JHt}from"/$bunfs/root/chunk-6fbka8qh.js";import{Be}from"/$bunfs/root/chunk-dbgyrqyp.js";import{ge}from"/$bunfs/root/chunk-s25vas16.js";var hvr="HKLM\\SOFTWARE\\Policies\\ClaudeCode",yvr="HKCU\\SOFTWARE\\Policies\\ClaudeCode",ZLn="Settings";var WNi=5000,tSs=2097152,N9e="/mnt/c/Windows/System32/reg.exe",GNi="unable to find the specified registry key or value",yM="/mnt/c/Program Files/ClaudeCode",o=ge({isCoworkCloud:void 0},(e)=>{e.isCoworkCloud=void 0});function KQt(){if(o.isCoworkCloud===void 0){let e=process.env.CLAUDE_CODE_ENTRYPOINT;o.isCoworkCloud=c$n.some((r)=>r===e)}return o.isCoworkCloud}function zNi(){o.isCoworkCloud=void 0,KQt()}function VQt(){let e=KQt();if(process.env.WSL_DISTRO_NAME&&!e)return!0;try{let r=Be("fs").readFileSync("/proc/version","utf8").toLowerCase();return JHt(r)}catch{return!1}}
export{hvr,yvr,ZLn,WNi,tSs,N9e,GNi,yM,KQt,zNi,VQt};
