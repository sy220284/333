// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ve}from"./chunk-wxyh2ndv.js";import{OTe}from"./chunk-q0j77z7t.js";import{i}from"./chunk-jdmxbspc.js";import{P}from"./chunk-tkwtwx7k.js";import{Sd}from"./chunk-ftd6jk9c.js";import{homedir as o}from"os";var LMo="CLAUDE_CODE_RELAUNCH_HOME_TRUST";async function C2s(){let r=await Sd(process.pid);if(r===void 0)return{};return{[LMo]:`${process.pid}:${r}`}}async function R2s(){let r=/^(\d{1,10}):(.{1,64})$/.exec(i.CLAUDE_CODE_RELAUNCH_HOME_TRUST??"");if(!r)return!1;let e=P()==="windows"?process.ppid:process.pid;if(Number(r[1])!==e)return!1;if(!OTe(ve(),o()))return!1;let t=await Sd(e,{skipCache:!0});return t!==void 0&&t===r[2]}
export{LMo,C2s,R2s};
