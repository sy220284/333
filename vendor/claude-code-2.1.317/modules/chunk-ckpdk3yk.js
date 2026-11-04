// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var ifn="SuggestConnectors",C$o="Resolve full connector payloads for directoryUuid values returned by SearchMcpRegistry.",R$o=`Resolve full connector payloads for a set of directoryUuid values returned by SearchMcpRegistry. Do NOT call this unless you already have directoryUuid values from a SearchMcpRegistry result, or installed connectors' server_id values listed in your system prompt \u2014 do not guess UUIDs or pass connector names.

Returns name, description, url, iconUrl, sample tool names, and whether the connector is already installed for the user's claude.ai org. installState reflects org-level auth, not whether tools are loaded this session \u2014 check ListConnectors' enabledInChat before claiming a connector is usable here. If a result looks relevant and is not installed, tell the user they could connect it via claude.ai; this tool does not itself connect anything.`;
export{ifn,C$o,R$o};
