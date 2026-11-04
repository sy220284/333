// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ga,tc}from"./chunk-ycr3h5db.js";import"./chunk-hawn56tf.js";var n=new Set([-32002,ga.InvalidParams]);function e(o){return o instanceof tc?o.code:void 0}function t(o){return o instanceof tc&&o.code===ga.MethodNotFound}function c(o){return o instanceof tc&&(o.code===ga.MethodNotFound||o.code===ga.InvalidParams)}function i(o){return o instanceof tc&&n.has(o.code)}function u(o){return o instanceof tc&&o.code===ga.InvalidParams}function d(o){return o instanceof tc&&o.code===ga.UrlElicitationRequired}export{e as getMcpErrorCode,t as isMcpMethodNotFoundError,u as isMcpNotADirectoryError,i as isMcpResourceNotFoundError,c as isMcpUnknownMethodError,d as isUrlElicitationRequiredMcpError};
