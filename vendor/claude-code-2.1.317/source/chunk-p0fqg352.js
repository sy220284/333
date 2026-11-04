// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{LMn,EMe,c7t,eM,ue}from"/$bunfs/root/chunk-yx0yvz1d.js";import{Mo}from"/$bunfs/root/chunk-jfgvczh1.js";import{mg,be,Kn}from"/$bunfs/root/chunk-mf6cjfte.js";var bOe=["theme","editorMode","verbose","preferredNotifChannel","autoCompactEnabled","autoScrollEnabled","fileCheckpointingEnabled","showTurnDuration","showMessageTimestamps","terminalProgressBarEnabled","todoFeatureEnabled","teammateMode","remoteControlAtStartup","autoUploadSessions","inputNeededNotifEnabled","agentPushNotifEnabled"];function ri(n,i){let o=Mo();for(let e=o.length-1;e>=0;e--){let t=o[e],s=be(t)?.[n];if(s===void 0)continue;if(t==="projectSettings"&&o.includes("userSettings")&&mg())continue;return{value:s,source:t}}if(bOe.includes(n)){let e=n,t=ue()[e];if(t!==void 0&&t!==eM[e]){let s=LMn(e)?c7t(e,t):EMe(e,t);if(s!==void 0)return{value:s,source:"legacyGlobalConfig"}}}return{value:i,source:"default"}}function V3(n,i,o){Kn("userSettings",{[n]:i},void 0,o)}
export{bOe,ri,V3};
