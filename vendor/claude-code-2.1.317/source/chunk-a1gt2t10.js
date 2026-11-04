// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ze,U}from"/$bunfs/root/chunk-wxyh2ndv.js";import{t}from"/$bunfs/root/chunk-qx8w2w8f.js";var r=new Ze(()=>({store:void 0})),s={maxBytes:0,save:async()=>null};function S7o(e){return r.peek(e)?.store??(e.host.launchOptions.diskless()?s:void 0)}function eh(){return S7o(U())}async function vYe(e,o){try{return await e.save(o)}catch{return t("A result could not be saved where the model reads files",{level:"error"}),null}}
export{S7o,eh,vYe};
