// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{P}from"/$bunfs/root/chunk-tkwtwx7k.js";import{sep as i}from"path";function Pme(t,r){let e=r.endsWith(i)?r:r+i;if(P()==="windows")return t.toLowerCase().startsWith(e.toLowerCase());return t.startsWith(e)}function m3(t,r){if(P()==="windows")return t.toLowerCase()===r.toLowerCase()||Pme(t,r);return t===r||Pme(t,r)}function a(t){return t.startsWith("/")?"/":"\\"}function UH(t,r,e){let n=e?t.toLowerCase():t,o=e?r.toLowerCase():r;if(n===o)return!0;let s=a(o),f=o.endsWith(s)?o:o+s;return n.startsWith(f)}
export{Pme,m3,UH};
