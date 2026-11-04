// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{wn,v}from"./chunk-yx0yvz1d.js";import{Ie}from"./chunk-y9ysdmh2.js";import{i}from"./chunk-jdmxbspc.js";import{P}from"./chunk-tkwtwx7k.js";import{$g}from"./chunk-hssxfvze.js";function Da(e="send"){if(e==="send"&&$g().messagingBeyondOwnAgentsDisabled)return!1;let r=i.CLAUDE_CODE_HARBOR_KITE;if(r!==void 0)return Ie(r);if(P()==="windows"&&!v("tengu_harbor_kite_win",!0))return!1;return v("tengu_harbor_kite",!0)}function ble(e){if(e?.flagsSettled===!1&&wn("tengu_cuddly_willow",!0).source==="fallback")return!1;return v("tengu_cuddly_willow",!0)}var _xn="Cross-session messaging is not available in this session.";
export{Da,ble,_xn};
