// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var KN="WaitForMcpServers";function $7o(){return["Wait for MCP servers that are still connecting and whose tools are not","yet in your tool list. Pass `servers` to wait for specific ones, or omit","it to wait for all pending servers (once none is pending, a call without","`servers` reports any server that failed to connect or is not configured).","",...["If the user's request needs tools from a still-connecting server, call this","tool to wait for it. Once it connects, its tools will be added to your tool","list and you can use them directly. Returns ready=true when servers are","ready, ready=false if they failed to connect, need authentication, or are","disabled."],"","You do not need to ask the user for confirmation to use this tool."].join(`
`)}function th(e){return e.name?.startsWith("mcp__")||e.isMcp===!0}function fit(e){return e.mcpInfo?.serverName??(e.name?.startsWith("mcp__")?e.name.split("__")[1]:void 0)}
export{th,fit,KN,$7o};
