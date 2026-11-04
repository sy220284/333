// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{dB,Qi}from"/$bunfs/root/chunk-0nz48hvd.js";async function cjn(r,i,a){if(!(r instanceof Error)||!r.message.startsWith("SDK auth failed: ")||!(r.cause instanceof Error))return!1;let{cause:e}=r,s=import.meta.require("/$bunfs/root/chunk-rgyrdt8j.js").mcpAuthModule().classifySdkAuthFailure(r.message,e);if(s!=="dcr_failed"&&s!=="dcr_rejected")return!1;if(!("status"in e)&&!("errorCode"in e))return e.message==="Incompatible auth server: does not support dynamic client registration";if(!((await dB())?.[Qi(i,a)]?.discoveryState?.oauthMetadataFound??a.oauth?.authServerMetadataUrl!==void 0))return!1;let t="status"in e?e.status:Number(/^HTTP (\d{3}): Invalid OAuth error response: /.exec(e.message)?.[1]);if(typeof t==="number"&&Number.isFinite(t))return t>=400&&t<500&&t!==408&&t!==429;switch("errorCode"in e?e.errorCode:void 0){case"invalid_client_metadata":case"invalid_client":case"unauthorized_client":return!0;default:return!1}}
export{cjn};
