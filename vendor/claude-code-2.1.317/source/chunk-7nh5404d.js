// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ie}from"/$bunfs/root/chunk-y9ysdmh2.js";import{Zd,In}from"/$bunfs/root/chunk-wxyh2ndv.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";function Ka(){if(!Ie(process.env.CLAUDE_CODE_COORDINATOR_MODE))return!1;if(Zd()&&!In()&&!i.CLAUDE_CODE_REMOTE)return!1;return!0}function hge(e){return Ka()&&e.agentId===void 0}
export{Ka,hge};
