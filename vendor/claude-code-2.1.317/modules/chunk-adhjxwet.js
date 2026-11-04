// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{b}from"./chunk-hd335g9m.js";import{t}from"./chunk-qx8w2w8f.js";import{a}from"./chunk-sqwfq8wd.js";import{hn}from"./chunk-26xg87f0.js";import{FQe}from"./chunk-jfbvz966.js";import{ce,y,j}from"./chunk-3j5jca5v.js";j();function u(o,n,r){return o.isWindowActivation||i(n,r)}function hE(){let o=hn(),[n]=y(()=>o.now());return ce((r)=>{let e=o.now();if(!u(r,n,e))return!1;let c=r.isWindowActivation?b("window_activation"):b("mount_settle");return t(`Select: dropped stray click (${r.isWindowActivation?"window-activation click":`${e-n}ms after mount`})`),a("tengu_select_stray_click_dropped",{reason:c}),r.dropAsStray(),!0},[o,n])}function RFt(){let o=hn(),[n]=y(()=>o.now());return ce(()=>i(n,o.now()),[o,n])}function i(o,n){return n-o<FQe}
export{hE,RFt};
