// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Bz}from"./chunk-qx8w2w8f.js";import{c9,Br,lmt,bo}from"./chunk-yyam3vx0.js";import{DQ}from"./chunk-sr539zbq.js";function MWe(r){return r.replace(/:\d+$/,"")}var e="gitlab.com",o="bitbucket.org",NUi={github:Br,gitlab:e,bitbucket:o},n={"ssh.github.com":"github","altssh.gitlab.com":"gitlab","altssh.bitbucket.org":"bitbucket"};function RL(r){if(r=MWe(r),bo(r))return"github";let t=lmt(r),i=n[t];if(i)return i;if(t===e)return"gitlab";if(t===o)return"bitbucket";return"other"}function _Ht(r){let t=r.trim();if(c9(t)||Bz(t)||DQ(t))return null;if(t.includes("://"))try{return new URL(t).hostname||null}catch{return null}return/^(?:[^@:/]+@)?([^:/]+):/.exec(t)?.[1]??null}function q0n(r){let t=/^([^@:/[\]]+)@([^@:/[\]]+):(.*)$/s.exec(r);return t&&!Bz(r)?{user:t[1],host:t[2],path:t[3]}:null}
export{MWe,NUi,RL,_Ht,q0n};
