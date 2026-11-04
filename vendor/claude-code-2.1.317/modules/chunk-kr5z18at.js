// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ha,sa}from"./chunk-9x9nwakp.js";var o=new Set([-32002,ha.InvalidParams]);function e(n){return n instanceof sa?n.code:void 0}function t(n){return n instanceof sa&&n.code===ha.MethodNotFound}function i(n){return n instanceof sa&&(n.code===ha.MethodNotFound||n.code===ha.InvalidParams)}function c(n){return n instanceof sa&&o.has(n.code)}function u(n){return n instanceof sa&&n.code===ha.InvalidParams}function d(n){return n instanceof sa&&n.code===ha.UrlElicitationRequired}export{e as getMcpErrorCode,t as isMcpMethodNotFoundError,u as isMcpNotADirectoryError,c as isMcpResourceNotFoundError,i as isMcpUnknownMethodError,d as isUrlElicitationRequiredMcpError};
