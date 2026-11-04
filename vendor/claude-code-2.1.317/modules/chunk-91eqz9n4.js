// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{v}from"./chunk-yx0yvz1d.js";import{i}from"./chunk-jdmxbspc.js";function t(){return process.argv.includes("--agent-teams")}function ns(){if(!i.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS&&!t())return!1;if(!v("tengu_amber_flint",!0))return!1;return!0}async function M5o(){if(!ns())return;let{captureTeammateModeSnapshot:e}=await import("./chunk-mdcfrss0.js");e()}
export{ns,M5o};
