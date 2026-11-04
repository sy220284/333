// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"/$bunfs/root/chunk-qx8w2w8f.js";import{wN}from"/$bunfs/root/chunk-5c8dhny2.js";import{v_,pD}from"/$bunfs/root/chunk-thp9mgjc.js";import{oC}from"/$bunfs/root/chunk-2cnrwtdq.js";function wq(e){let o=v_(),s=!!e.isAutoModeAvailable&&o;if(!s)t(`[auto-mode] canCycleToAuto=false: ctx.isAutoModeAvailable=${e.isAutoModeAvailable} isAutoModeGateEnabled=${o} reason=${pD()}`);return s}function _dn(e){return!!e.isBypassPermissionsModeAvailable&&!oC()}function bdn(e,o){switch(e.mode){case"default":return"acceptEdits";case"acceptEdits":return"plan";case"plan":if(_dn(e))return"bypassPermissions";if(wq(e))return"auto";return"default";case"bypassPermissions":if(wq(e))return"auto";return"default";case"dontAsk":return"default";default:return"default"}}function uMo(e,o,s){let n=bdn(e,o);return{nextMode:n,context:wN(e.mode,n,e,s)}}
export{wq,_dn,bdn,uMo};
