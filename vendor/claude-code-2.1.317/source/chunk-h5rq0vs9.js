// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var qmr=["mcp__Claude_Preview__","mcp__Claude_Browser__","mcp__remote-devices__Claude_Browser__"];var Iis="mcp__claude-device__chrome_",mle=["mcp__claude-in-chrome__","mcp__Claude_in_Chrome__","mcp__remote-devices__claude-in-chrome__","mcp__remote-devices__Claude_in_Chrome__","mcp__claude-device__chrome_",...qmr];function r(_){if(!_.startsWith("mcp__claude-device__chrome_"))return null;let e=_.slice(27);return e===""||e.startsWith("_")||e.includes("__")?null:e}function Ois(_){let e=r(_);return e===null?_:"mcp__claude-in-chrome__"+e}function eTi(_,e){let n=r(_);return n!==null&&e==="chrome_"+n?n:e}var t=new RegExp("(?<![\\w-])mcp__claude-device__chrome_[\\w-]*","g");function qno(_){return _.replace(t,(e)=>e==="mcp__claude-device__chrome_"?"mcp__claude-in-chrome__":Ois(e))}function ik(_){return mle.some((e)=>_.startsWith(e))}function x8t(_){return qmr.some((e)=>_.startsWith(e))}
export{qmr,Iis,mle,Ois,eTi,qno,ik,x8t};
