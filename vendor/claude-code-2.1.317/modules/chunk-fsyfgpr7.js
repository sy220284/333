// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{v}from"./chunk-yx0yvz1d.js";import{no}from"./chunk-wxyh2ndv.js";import{i}from"./chunk-jdmxbspc.js";import{XHt,cf}from"./chunk-bjevk2dr.js";var qCt=5000;function JA(){if(i.CLAUDE_CODE_DISABLE_MCP_TASKS)return!1;return v("tengu_glowing_lark",cf()===XHt&&!i.CLAUDE_CODE_REMOTE&&!no())}function pTn(){return JA()&&v("tengu_mcp_task_worker_wake",!1)}function DZo(){return i.CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND}
export{qCt,JA,pTn,DZo};
