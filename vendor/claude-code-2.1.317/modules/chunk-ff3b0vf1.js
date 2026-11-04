// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{syo}from"./chunk-wxyh2ndv.js";var NH={red:"red_FOR_SUBAGENTS_ONLY",blue:"blue_FOR_SUBAGENTS_ONLY",green:"green_FOR_SUBAGENTS_ONLY",yellow:"yellow_FOR_SUBAGENTS_ONLY",purple:"purple_FOR_SUBAGENTS_ONLY",orange:"orange_FOR_SUBAGENTS_ONLY",pink:"pink_FOR_SUBAGENTS_ONLY",cyan:"cyan_FOR_SUBAGENTS_ONLY"},yS=Object.keys(NH);function w4(e){return e!==void 0&&yS.includes(e)}function qFe(e){return e.userOverride??e.agentDefinitionColor}function YFe(e){if(e==="general-purpose")return;let n=syo().get(e);if(n&&yS.includes(n))return NH[n];return}function OCt(e,o){let n=syo();if(!o){n.delete(e);return}if(yS.includes(o))n.set(e,o)}
export{NH,yS,w4,qFe,YFe,OCt};
