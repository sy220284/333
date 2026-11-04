// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"./chunk-jdmxbspc.js";import{rho,cf,AA,Jf,GQ}from"./chunk-bjevk2dr.js";import{dn}from"./chunk-yp8dgdes.js";import{pct}from"./chunk-yx0yvz1d.js";function r(){if(AA()||GQ())return null;if(dn()){let t=cf();if(t===void 0||!t.startsWith("remote")||rho.has(t))return null;return pct()?null:"cloud"}if(i.CLAUDE_CODE_REMOTE)return null;return Jf()?"desktop":null}function WXn(){return i.CLAUDE_CODE_ARTIFACT_SHARE===!0&&r()!==null}
export{WXn};
