// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{If,zN}from"./chunk-8qrv8dh1.js";import{Oc,eSe,lie,bee,u1}from"./chunk-thp9mgjc.js";function s(o,t){let c=If(),e=Oc(o),n=bee(e,t),a=u1(e,t),r=!(zN()&&!eSe(e,t));return{enabled:c,effectiveWindow:n,threshold:a,enforced:r,source:lie(e,t)}}function FDs(o){let t;return{notify(c,e){let n=s(c,e);if(t!==void 0&&xSo(t,n))return;t=n,o(n)},reset(){t=void 0}}}function xSo(o,t){return o.enabled===t.enabled&&o.effectiveWindow===t.effectiveWindow&&o.threshold===t.threshold&&o.enforced===t.enforced&&o.source===t.source}
export{FDs,xSo};
