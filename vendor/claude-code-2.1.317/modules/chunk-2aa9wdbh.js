// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{k3,$Rt}from"./chunk-kwv0r5ag.js";import{Ive}from"./chunk-yx0yvz1d.js";import{uxe}from"./chunk-thp9mgjc.js";import{pde}from"./chunk-aqhsn9c5.js";function nLs(i){let n="client_platform"in i?i.client_platform:void 0;return!(Ive("origin"in i?i.origin:void 0,"isSynthetic"in i&&Boolean(i.isSynthetic))||("is_meta"in i)&&i.is_meta===!0||("seeded_summon"in i)&&i.seeded_summon===!0||("client_composed"in i)&&i.client_composed===!0||("inbound_origin"in i)&&i.inbound_origin!==void 0||n!==void 0&&!(typeof n==="string"&&(k3(n)||$Rt(n)))||pde(i)||uxe("initiator"in i&&typeof i.initiator==="string"?i.initiator:void 0)!==void 0)}
export{nLs};
