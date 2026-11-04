// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{k,er}from"./chunk-5x4vp4dg.js";import{g,m}from"./chunk-5s4g6bgt.js";import{t}from"./chunk-qx8w2w8f.js";import{Fe}from"./chunk-v1dhx02j.js";import{je}from"./chunk-m2dj5b5f.js";import{yc}from"./chunk-jdmxbspc.js";import{it}from"./chunk-fmhqrrj2.js";import{ft}from"./chunk-mf6cjfte.js";import{Nit}from"./chunk-z03r0vvm.js";import{$ue}from"./chunk-t4nemnrm.js";import{a3e}from"./chunk-qkn1dsar.js";import{X}from"./chunk-xv54wykd.js";import{promises as n}from"fs";import*as w from"os";import*as o from"path";var D="com.anthropic.claude-code-url-handler",p="Claude Code URL Handler",h="claude-code-url-handler.desktop",_="Claude Code URL Handler.app",c=o.join(w.homedir(),"Applications",_),l=o.join(c,"Contents","MacOS","claude");function d(){return o.join(a3e(),"applications",h)}var u=`HKEY_CURRENT_USER\\Software\\Classes\\${$ue}`,y=`${u}\\shell\\open\\command`,f=86400000;function C(e){return`Exec="${e}" --handle-uri %u`}function E(e){return`"${e}" --handle-uri "%1"`}async function F(e){let r=o.join(c,"Contents");try{await n.rm(c,{recursive:!0})}catch(s){if(k(s)!=="ENOENT")throw s}await n.mkdir(o.dirname(l),{recursive:!0});let i=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${D}</string>
  <key>CFBundleName</key>
  <string>${p}</string>
  <key>CFBundleExecutable</key>
  <string>claude</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSBackgroundOnly</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>Claude Code Deep Link</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>${$ue}</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`;await n.writeFile(o.join(r,"Info.plist"),i),await n.symlink(e,l),await it("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",["-R",c],{useCwd:!1}),t(`Registered ${$ue}:// protocol handler at ${c}`)}async function L(e){await n.mkdir(o.dirname(d()),{recursive:!0});let r=`[Desktop Entry]
Name=${p}
Comment=Handle ${$ue}:// deep links for Claude Code
${C(e)}
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/${$ue};
`;await n.writeFile(d(),r);let i=await yc("xdg-mime");if(i){let{code:a}=await it(i,["default",h,`x-scheme-handler/${$ue}`],{useCwd:!1});if(a!==0)throw Object.assign(Error(`xdg-mime exited with code ${a}`),{code:"XDG_MIME_FAILED"})}t(`Registered ${$ue}:// protocol handler at ${d()}`)}async function S(e){for(let r of[["add",u,"/ve","/d",`URL:${p}`,"/f"],["add",u,"/v","URL Protocol","/d","","/f"],["add",y,"/ve","/d",E(e),"/f"]]){let{code:i}=await it("reg",r,{useCwd:!1});if(i!==0)throw Object.assign(Error(`reg add exited with code ${i}`),{code:"REG_FAILED"})}t(`Registered ${$ue}:// protocol handler in Windows registry`)}async function x(e){let r=e??await P();switch("linux"){case"darwin":await F(r);break;case"linux":await L(r);break;case"win32":await S(r);break;default:throw Error("Unsupported platform: linux")}}async function P(){let e=Nit();try{return await n.realpath(e),e}catch{return process.execPath}}async function v(e){try{switch("linux"){case"darwin":return await n.readlink(l)===e;case"linux":return(await n.readFile(d(),"utf8")).includes(C(e));case"win32":{let{stdout:r,code:i}=await it("reg",["query",y,"/ve"],{useCwd:!1});return i===0&&r.includes(E(e))}default:return!1}}catch{return!1}}async function oLs(e){if(ft().disableDeepLinkRegistration==="disable")return;if(!["darwin","linux","win32"].includes("linux"))return;let r=await P();if(await v(r))return;let i=o.join(Fe(),".deep-link-register-failed");if(X()&&e!==void 0){let a=await e.stat(je.state("deep-link-register-failed"));if(a.ok&&Date.now()-a.value.mtimeMs<f)return}else try{let a=await n.stat(i);if(Date.now()-a.mtimeMs<f)return}catch{}try{if(await x(r),g("deep_link_register"),t("Auto-registered claude-cli:// deep link protocol handler"),X()&&e!==void 0)await e.delete(je.state("deep-link-register-failed"));else await n.rm(i,{force:!0}).catch(()=>{})}catch(a){let s=er(a);if(m("deep_link_register",s??"register_failed"),t(`Failed to auto-register deep link protocol handler: ${a instanceof Error?a.message:String(a)}`,{level:"warn"}),s==="EACCES"||s==="ENOSPC")if(X()&&e!==void 0)await e.write(je.state("deep-link-register-failed"),"",{publishDiscipline:"inPlace"});else await n.writeFile(i,"").catch(()=>{})}}
export{oLs};
