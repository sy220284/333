import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { SandboxManager, shouldAllowManagedSandboxDomainsOnly } from '../../utils/sandbox/sandbox-adapter.js';
export function SandboxConfigTab() {
  const $ = _c(3);
  const isEnabled = SandboxManager.isSandboxingEnabled();
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    const depCheck = SandboxManager.checkDependencies();
    t0 = depCheck.warnings.length > 0 ? <Box marginTop={1} flexDirection="column">{depCheck.warnings.map(_temp)}</Box> : null;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const warningsNote = t0;
  if (!isEnabled) {
    let t1;
    if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <Box flexDirection="column" paddingY={1}><Text color="subtle">沙箱尚未启用</Text>{warningsNote}</Box>;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    return t1;
  }
  let t1;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    const fsReadConfig = SandboxManager.getFsReadConfig();
    const fsWriteConfig = SandboxManager.getFsWriteConfig();
    const networkConfig = SandboxManager.getNetworkRestrictionConfig();
    const allowUnixSockets = SandboxManager.getAllowUnixSockets();
    const excludedCommands = SandboxManager.getExcludedCommands();
    const globPatternWarnings = SandboxManager.getLinuxGlobPatternWarnings();
    t1 = <Box flexDirection="column" paddingY={1}><Box flexDirection="column"><Text bold={true} color="permission">排除的命令：</Text><Text dimColor={true}>{excludedCommands.length > 0 ? excludedCommands.join(", ") : "无"}</Text></Box>{fsReadConfig.denyOnly.length > 0 && <Box marginTop={1} flexDirection="column"><Text bold={true} color="permission">文件读取限制：</Text><Text dimColor={true}>拒绝：{fsReadConfig.denyOnly.join(", ")}</Text>{fsReadConfig.allowWithinDeny && fsReadConfig.allowWithinDeny.length > 0 && <Text dimColor={true}>拒绝范围内允许： {fsReadConfig.allowWithinDeny.join(", ")}</Text>}</Box>}{fsWriteConfig.allowOnly.length > 0 && <Box marginTop={1} flexDirection="column"><Text bold={true} color="permission">文件写入限制：</Text><Text dimColor={true}>允许：{fsWriteConfig.allowOnly.join(", ")}</Text>{fsWriteConfig.denyWithinAllow.length > 0 && <Text dimColor={true}>允许范围内拒绝： {fsWriteConfig.denyWithinAllow.join(", ")}</Text>}</Box>}{(networkConfig.allowedHosts && networkConfig.allowedHosts.length > 0 || networkConfig.deniedHosts && networkConfig.deniedHosts.length > 0) && <Box marginTop={1} flexDirection="column"><Text bold={true} color="permission">网络访问限制{shouldAllowManagedSandboxDomainsOnly() ? "（托管）" : ""}:</Text>{networkConfig.allowedHosts && networkConfig.allowedHosts.length > 0 && <Text dimColor={true}>允许：{networkConfig.allowedHosts.join(", ")}</Text>}{networkConfig.deniedHosts && networkConfig.deniedHosts.length > 0 && <Text dimColor={true}>拒绝：{networkConfig.deniedHosts.join(", ")}</Text>}</Box>}{allowUnixSockets && allowUnixSockets.length > 0 && <Box marginTop={1} flexDirection="column"><Text bold={true} color="permission">允许的 Unix 套接字：</Text><Text dimColor={true}>{allowUnixSockets.join(", ")}</Text></Box>}{globPatternWarnings.length > 0 && <Box marginTop={1} flexDirection="column"><Text bold={true} color="warning">⚠ 警告：Linux 未完全支持 Glob 通配模式</Text><Text dimColor={true}>以下模式将被忽略：{" "}{globPatternWarnings.slice(0, 3).join(", ")}{globPatternWarnings.length > 3 && ` (${globPatternWarnings.length - 3} 项更多）`}</Text></Box>}{warningsNote}</Box>;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}
function _temp(w, i) {
  return <Text key={i} dimColor={true}>{w}</Text>;
}
