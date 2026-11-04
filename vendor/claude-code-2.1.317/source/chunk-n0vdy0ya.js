// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var _it="SearchMcpRegistry",X7o="Search the MCP connector registry by keyword to discover connectors that might help complete the task.",J7o=`Search the MCP connector registry by keyword. Call this when connecting to an MCP server might help complete the task \u2014 whether or not the user named a specific product.

Named-product examples:
- "check my Asana tasks" \u2192 keywords ["asana", "tasks", "todo"]
- "find issues in Jira" \u2192 keywords ["jira", "issues"]

Intent-based examples (no product named):
- "help me manage my tasks" \u2192 keywords ["tasks", "todo", "project management"]
- "pull up the design mockups" \u2192 keywords ["design", "figma", "mockup"]

Returns a ranked list with directoryUuid, name, description, sample tool names, installState (org-level), and enabledInChat (this session). Results include the org's custom connectors (ones the org configured that are not in the public directory) when they match the keywords. enabledInChat: false with installState: "connected" means the connector's tools are not loaded in this session, so you cannot call them; the field does not say why. There may be no connector setting for this chat alone. If the request needs the connector, tell the user it is not available here and that they can check it, and its tool permissions, in their claude.ai connector settings. If a result looks relevant and is not installed, tell the user they could connect it via claude.ai; this tool does not itself connect anything.`;
export{_it,X7o,J7o};
