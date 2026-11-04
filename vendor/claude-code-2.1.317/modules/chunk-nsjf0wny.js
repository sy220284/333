// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{nRs}from"./chunk-wxyh2ndv.js";import{ka}from"./chunk-y5f1xxbg.js";function ICo(e){if(e)ka.terminalFocusGainedAt=Date.now();if(!e&&ka.terminalFocus==="blurred")return;ka.terminalFocus=e?"focused":"blurred",nRs(e),ka.terminalFocusChanged.emit()}function Vze(){return ka.terminalFocus!=="blurred"}function tse(){return ka.terminalFocus}function kBs(){return ka.terminalFocusGainedAt}function IHe(e){return ka.terminalFocusChanged.subscribe(e)}
export{ICo,Vze,tse,kBs,IHe};
