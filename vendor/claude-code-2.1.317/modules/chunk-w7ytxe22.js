// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ww,J0i,W8}from"./chunk-9z9d97rw.js";import{i}from"./chunk-jdmxbspc.js";import{ft}from"./chunk-mf6cjfte.js";import{O_r}from"./chunk-8p89vp46.js";function r8(e){return i.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS||(e??ft()).disableBundledSkills===!0}var uao="allow_bundled_skills";function Y3e(){return!ww(uao)}function n(){return J0i()??O_r}function iY(e){return Y3e()&&!n().includes(e)}function qge(e,t){return r8(t)||iY(e)}function TPi(){return W8(uao,"Bundled skills","are")}function v_r(e){let t=Y3e();return`${r8(e)}:${t}:${t?n().join(","):""}`}function fao(e,t){return e.type==="prompt"&&e.source==="builtin"&&qge(e.name,t)}
export{r8,uao,Y3e,iY,qge,TPi,v_r,fao};
