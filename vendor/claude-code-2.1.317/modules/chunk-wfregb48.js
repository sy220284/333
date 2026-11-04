// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{x}from"./chunk-dbgyrqyp.js";var JD=x(function(i){var r={warningEmitted:!1},n=(e)=>{if(e&&!r.warningEmitted&&parseInt(e.substring(1,e.indexOf(".")))<18)r.warningEmitted=!0,process.emitWarning(`NodeDeprecationWarning: The AWS SDK for JavaScript (v3) will
no longer support Node.js 16.x on January 6, 2025.

To continue receiving updates to AWS services, bug fixes, and security
updates please upgrade to a supported Node.js LTS version.

More information can be found at: https://a.co/74kJMmI`)};function a(e,t,s){if(!e.$source)e.$source={};return e.$source[t]=s,e}function o(e,t,s){if(!e.__aws_sdk_context)e.__aws_sdk_context={features:{}};else if(!e.__aws_sdk_context.features)e.__aws_sdk_context.features={};e.__aws_sdk_context.features[t]=s}function u(e,t,s){if(!e.$source)e.$source={};return e.$source[t]=s,e}i.emitWarningIfUnsupportedVersion=n;i.setCredentialFeature=a;i.setFeature=o;i.setTokenFeature=u;i.state=r});
export{JD};
