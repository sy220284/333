// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var lxi="--gh-standin",C3e=".ghe.com";var dxi="--any-host",NPn="standalone-proxy",cxi="gh: this session's proxy is not set (HTTPS_PROXY names no proxy on 127.0.0.1), so gh cannot reach GitHub; run gh from this session's own shell, with HTTPS_PROXY as the session set it.";function uxi(n){let t=URL.parse(n?.trim()??"");return t?.protocol==="http:"&&t.hostname==="127.0.0.1"?t.href:void 0}function fxi(){return`proxy="$(printf %s "\${HTTPS_PROXY:-}" | tr -d '[:space:]')"
authority="\${proxy#http://}"
authority="\${authority%%[/?#]*}"
case "$proxy" in http://*) hostport="\${authority##*@}" ;; *) hostport= ;; esac
case "$hostport" in
  127.0.0.1:*[!0-9]*|127.0.0.1:) hostport= ;;
  127.0.0.1|127.0.0.1:*) ;;
  *) hostport= ;;
esac
if [ -z "$hostport" ]; then
  printf '%s\\n' "gh: this session's proxy is not set (HTTPS_PROXY names no proxy on 127.0.0.1), so gh cannot reach GitHub; run gh from this session's own shell, with HTTPS_PROXY as the session set it." >&2
  exit 1
fi
HTTPS_PROXY="$proxy"; https_proxy="$proxy"; export HTTPS_PROXY https_proxy
`}var KK="any";function pxi(){let[n,t="",e="",...s]=process.argv.slice(2);if(n!=="--gh-standin")return;process.argv=process.argv.slice(0,3);let o=s[0]==="--any-host",r=o||s[0]?.startsWith("--hosts=")?s.shift():void 0,[i,...h]=s;if((t==="standalone-proxy"||/^[1-9]\d{0,4}$/.test(t)&&Number(t)<=65535)&&e!==""&&i==="--"){let a=o?KK:r?.slice(8).split(",")??[];return{port:t==="standalone-proxy"?t:Number(t),caBundlePath:e,ghesHosts:a,ghArgs:h}}return process.stderr.write(`gh: this command is run by the gh shim Claude Code writes for a session; it is not for direct use.
`),process.exitCode=1,"refused"}function mxi(n){let[t,e]=n.ghesHosts===KK?["--any-host"," or the GitHub Enterprise host a command names"]:n.ghesHosts.length>0?["--hosts="+n.ghesHosts.join(",")," and the hosts named below"]:[void 0,""],s=[...n.command,"--gh-standin",String(n.port),n.caBundlePath,...t===void 0?[]:[t]].map((o)=>`'${o}'`);return`#!/bin/sh
# Claude Code gh stand-in shim (auto-generated; per-session).
# No GitHub CLI was found on this machine when this session started,
# so gh here is Claude Code's own implementation of \`gh api\`: REST
# requests to github.com${e} through the session's GitHub proxy. It reads
# no GitHub token from the environment and sends none.
exec ${s.join(" ")} -- "$@"
`}
export{lxi,C3e,dxi,NPn,cxi,uxi,fxi,KK,pxi,mxi};
