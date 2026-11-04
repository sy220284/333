// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Mn}from"./chunk-qx8w2w8f.js";import{at}from"./chunk-tm88cq46.js";import{Sx,ze}from"./chunk-p9j1kqer.js";import{Ve}from"./chunk-zvxmwtvh.js";import{stripVTControlCharacters as i}from"util";function FGt(t,e=3){let r=t.map((s)=>Mn(i(s)).trim()),o=r.slice(0,e).join(", "),n=r.length-e;return n>0?`${o} (${n} more)`:o}function ZGr(t=Number.POSITIVE_INFINITY){try{if(!ze.isSandboxingEnabled())return;let e=ze.getDeniesDroppedForAnotherHost();if(e.length===0)return;let r=`The sandbox would contact that computer before each command, so it leaves these entries out. An entry that the list calls a ${Ve} rule or an ${at} rule still applies to the file tools. To have the sandbox block the paths, start Claude Code in a folder on that computer.`;return{issue:`Sandbox deny paths on another computer are not enforced, so sandboxed commands are not blocked from them: ${FGt(e,t)}`,fix:e.some((o)=>o.endsWith(" from policySettings"))?`${r} If an administrator manages the entries from policySettings, tell them that the sandbox does not enforce these.`:r}}catch(e){Sx(e,"deniesOnAnotherHostNotDescribed");return}}function MWo(){let t=ZGr(3);if(t)process.stderr.write(`
\u26A0 ${t.issue}
  ${t.fix} \`claude doctor\` lists every entry.

`)}
export{FGt,ZGr,MWo};
