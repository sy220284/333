// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{nui,lui}from"./chunk-ttn3wae7.js";import{cue}from"./chunk-gk7abvg5.js";function pNt({sessionId:t,getAccessToken:s,fetchSession:i,initial:e,createOrigin:d}){if(!cue())return;let n=!1,r=(o)=>nui(o,n);return lui({...e&&{initial:e.then(r)},read:()=>i(t,{accessToken:s()}).then(r)})}
export{pNt};
