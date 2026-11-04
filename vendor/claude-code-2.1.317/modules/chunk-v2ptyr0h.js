// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{K}from"./chunk-wxyh2ndv.js";import{ZTs}from"./chunk-bjevk2dr.js";import{Tye}from"./chunk-3p0yye92.js";var t=/^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;function UFo(){let e=ZTs();if(!e)return"unset";if(!t.test(e))return"malformed";return Tye()?"ignored":"used"}function o(){return UFo()==="used"?ZTs():void 0}function BFo(){let e=o();return e===void 0?{key:K(),fromHost:!1}:{key:e,fromHost:!0}}function Mfn(){return BFo().key}
export{UFo,BFo,Mfn};
