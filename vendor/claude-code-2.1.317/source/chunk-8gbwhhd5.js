// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Zd}from"/$bunfs/root/chunk-wxyh2ndv.js";import{v}from"/$bunfs/root/chunk-yx0yvz1d.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{P}from"/$bunfs/root/chunk-tkwtwx7k.js";import{aoe}from"/$bunfs/root/chunk-xx070fcm.js";import{dn}from"/$bunfs/root/chunk-yp8dgdes.js";import{Ne,Rt}from"/$bunfs/root/chunk-tm88cq46.js";var Xp=[Ne,Rt];function nk(){let o=i.CLAUDE_CODE_USE_POWERSHELL_TOOL;if(P()!=="windows")return o===!0;if(o!==void 0)return o;if(aoe()===null)return!0;return v("tengu_cobalt_ridge",!1)}function Yd(){if(P()!=="windows")return!0;return aoe()!==null}function Blr(o,e){return Zd()||o||e||!dn()||v("tengu_wiggly_locket",!1)!==!0}var pQo=`Claude Code on Windows requires either Git for Windows (for bash) or PowerShell. Install one of:
  - Git for Windows: https://git-scm.com/downloads/win
  - PowerShell 7: https://aka.ms/powershell
Or set CLAUDE_CODE_GIT_BASH_PATH to your bash.exe location.`;function RU(){return Yd()?"bash":"powershell"}
export{Xp,nk,Yd,Blr,pQo,RU};
