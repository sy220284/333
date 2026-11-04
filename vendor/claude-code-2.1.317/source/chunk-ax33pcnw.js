// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ee}from"/$bunfs/root/chunk-f95bhbz8.js";import{randomUUID as s}from"crypto";var m=256;function a3n(e=s(),t){if(t!==void 0){let o=ee().laneNoticeSlugs;o.set(e,t),r(o)}return e}function o6s(e){return ee().laneNoticeSlugs.get(e)}function s6s(e,t,o){let n=ee(),i=Date.now();if(e!==void 0)n.commentReads.set(e,{slug:t,ownWordsOnly:o}),r(n.commentReads);if(n.commentReadAtBySlug.delete(t),n.commentReadAtBySlug.set(t,i),r(n.commentReadAtBySlug)||!o)n.lastOthersCommentReadAt=i}function i6s(e){return ee().commentReads.get(e)}function l3n(e,t){for(let[o,n]of ee().commentReadAtBySlug)if(o!==e&&!(Number.isFinite(t)&&n<t))return!0;return!1}function d3n(){return ee().lastOthersCommentReadAt}function r(e){if(e.size<=m)return!1;let t=e.keys().next().value;if(t!==void 0)e.delete(t);return!0}
export{a3n,o6s,s6s,i6s,l3n,d3n};
