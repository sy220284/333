// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Wn}from"/$bunfs/root/chunk-hd335g9m.js";var n=new Set(["starting","running","resuming","adopted","crashed","working","blocked","done","stopped","failed","busy","shell","idle","waiting"]);function W5(e){if(e===void 0)return;return Wn(n.has(e)?e:"other")}var t=new Set(["cold","spare","adopted"]);function DUt(e){return typeof e==="string"&&t.has(e)?e:void 0}
export{W5,DUt};
