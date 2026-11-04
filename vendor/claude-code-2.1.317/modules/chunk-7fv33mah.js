// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{DXo}from"./chunk-ppbzmym5.js";import{N}from"./chunk-5x4vp4dg.js";import{un}from"./chunk-yx0yvz1d.js";import{l}from"./chunk-xkb87seb.js";import{eGe,AB}from"./chunk-bjevk2dr.js";import{NAt}from"./chunk-savf66h2.js";function DVn(e){let o=e.trim();return o!==""&&!o.startsWith("/")}var TOo=()=>!1;var AOo=()=>AB()&&!eGe()&&un("tengu_quiet_ember",TOo());var LVn={name:"cc-plugin-responsive-mode",description:"Responsive mode: Claude replies to you in a sentence before thinking or using tools, on every prompt",isAvailable:AOo,defaultEnabled:!1};function jNr({text:e,pastedContents:o,isSentByPerson:t,wait:r}){if(!t||r||!DVn(e))return!1;try{return DXo(e,o).length===0&&NAt(LVn.name)}catch(i){return l(N(i)),!1}}
export{DVn,TOo,AOo,LVn,jNr};
