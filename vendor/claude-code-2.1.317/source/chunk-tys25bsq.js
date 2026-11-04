// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{$r}from"/$bunfs/root/chunk-wxyh2ndv.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{pF}from"/$bunfs/root/chunk-xkb87seb.js";import{Ln}from"/$bunfs/root/chunk-74x0zd10.js";function t(){if(i.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)return!1;if(!Ln())return!0;return!1}function tHi(){return i.CLAUDE_CODE_ENVIRONMENT_KIND==="byoc"&&!i.CLAUDE_CODE_BYOC_ENABLE_DATADOG}function e(){return i.CLAUDE_CODE_CUSTOM_OAUTH_URL!==void 0}function yDn(){return!pF()&&!e()}function Dy(){return pF()||t()||$r()!==null||e()}function qMt(){return t()||$r()!==null||e()}function Sde(){return i.CLAUDE_CODE_ENABLE_FEEDBACK_SURVEY_FOR_OTEL}function P8(){if(Sde())return!1;return pF()}
export{tHi,yDn,Dy,qMt,Sde,P8};
