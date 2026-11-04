// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{b,f}from"./chunk-hd335g9m.js";import{a}from"./chunk-sqwfq8wd.js";import{W2e,FZ,t6,cBr,uBr}from"./chunk-qj1r3zvj.js";var B2e={accepted:"Allowed",declined:"Not allowed",unset:"Not asked yet"},t="Turned off by your organization's settings (remoteTools.allowUnattendedServing)",o="Turned off in your user settings (remoteTools.allowUnattendedServing: false in ~/.claude/settings.json) \u2014 remove it there to re-enable";function hun(){return cBr()==="user"?o:t}function VYn(e){return FZ()!=="unset"||uBr()||e}function qYn(){return FZ()==="accepted"||uBr()}async function YYn(e){if(e==="accepted"&&t6())return"forbidden";let n=e==="accepted"?"accepted":FZ()==="accepted"?"revoked":"declined";if(!await W2e(e))return"not_saved";return a("tengu_served_unattended_consent",{action:f(n),surface:b("cli")}),"saved"}
export{B2e,hun,VYn,qYn,YYn};
