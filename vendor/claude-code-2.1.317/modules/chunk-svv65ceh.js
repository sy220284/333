// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{f}from"./chunk-hd335g9m.js";import{d}from"./chunk-5x4vp4dg.js";import{Pe}from"./chunk-yx0yvz1d.js";import{t}from"./chunk-qx8w2w8f.js";import{Wr}from"./chunk-5s4g6bgt.js";async function SQe(o,r,n){try{await Promise.all([Pe((e)=>e.managedSettingsNoticeSeenOrg===o?e:{...e,managedSettingsNoticeSeenOrg:o},n),Wr("remote_managed_settings_login_notice",{surface:f(r)})])}catch(e){t(`managed settings notice: not recorded as shown: ${d(e)}`,{level:"error"})}}
export{SQe};
