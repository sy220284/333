// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{Te,Ti,Az,Fu,oc}from"/$bunfs/root/chunk-74x0zd10.js";import{wc,g0}from"/$bunfs/root/chunk-yx0yvz1d.js";import{kWe}from"/$bunfs/root/chunk-dk152bb6.js";import{ZEe}from"/$bunfs/root/chunk-jjdf3qvx.js";function Yat(r=Te()){if(r!=="firstParty"||!Ti())return!1;if(Az())return!0;return s()}function n7(r=Te()){if(r!=="firstParty"||!Fu())return!1;if(i.ANTHROPIC_BASE_URL!==void 0||!wc()||!g0())return!0;let t=ZEe(),e=t===void 0?kWe()??null:t;return e===null||oc(e)}function s(){if(i.ANTHROPIC_BASE_URL!==void 0||!g0())return!0;let r=ZEe();return r===null||r!==void 0&&oc(r)}function keo(){if(i.ANTHROPIC_BASE_URL!==void 0)return i.ANTHROPIC_BASE_URL;try{if(g0()){let r=ZEe();if(typeof r==="string")return r}}catch{}return"https://api.anthropic.com"}
export{Yat,n7,keo};
