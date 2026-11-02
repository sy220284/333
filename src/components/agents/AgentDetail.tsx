import { c as _c } from "react/compiler-runtime";
import figures from 'figures';
import * as React from 'react';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import { Box, Text } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import type { 工具 } from '../../Tool.js';
import { getAgent颜色 } from '../../tools/AgentTool/agent颜色Manager.js';
import { get记忆ScopeDisplay } from '../../tools/AgentTool/agent记忆.js';
import { resolveAgent工具 } from '../../tools/AgentTool/agentToolUtils.js';
import { type AgentDefinition, isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js';
import { getAgent模型Display } from '../../utils/model/agent.js';
import { Markdown } from '../Markdown.js';
import { getActualRelativeAgentFilePath } from './agentFileUtils.js';
type Props = {
  agent: AgentDefinition;
  tools: 工具;
  allAgents?: AgentDefinition[];
  onBack: () => void;
};
export function AgentDetail(t0) {
  const $ = _c(48);
  const {
    agent,
    tools,
    onBack
  } = t0;
  const resolved工具 = resolveAgent工具(agent, tools, false);
  let t1;
  if ($[0] !== agent) {
    t1 = getActualRelativeAgentFilePath(agent);
    $[0] = agent;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const filePath = t1;
  let t2;
  if ($[2] !== agent.agentType) {
    t2 = getAgent颜色(agent.agentType);
    $[2] = agent.agentType;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const background颜色 = t2;
  let t3;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = {
      context: "Confirmation"
    };
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  useKeybinding("confirm:no", onBack, t3);
  let t4;
  if ($[5] !== onBack) {
    t4 = e => {
      if (e.key === "return") {
        e.preventDefault();
        onBack();
      }
    };
    $[5] = onBack;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  const handleKeyDown = t4;
  const render工具List = function render工具List() {
    if (resolved工具.hasWildcard) {
      return <Text>所有工具</Text>;
    }
    if (!agent.tools || agent.tools.length === 0) {
      return <Text>无</Text>;
    }
    return <>{resolved工具.valid工具.length > 0 && <Text>{resolved工具.valid工具.join(", ")}</Text>}{resolved工具.invalid工具.length > 0 && <Text color="warning">{figures.warning} 未识别：{" "}{resolved工具.invalid工具.join(", ")}</Text>}</>;
  };
  const T0 = Box;
  const t5 = "column";
  const t6 = 1;
  const t7 = 0;
  const t8 = true;
  let t9;
  if ($[7] !== filePath) {
    t9 = <Text dim颜色={true}>{filePath}</Text>;
    $[7] = filePath;
    $[8] = t9;
  } else {
    t9 = $[8];
  }
  let t10;
  if ($[9] === Symbol.for("react.memo_cache_sentinel")) {
    t10 = <Text><Text bold={true}>描述</Text>（说明 Claude 何时使用此代理）：</Text>;
    $[9] = t10;
  } else {
    t10 = $[9];
  }
  let t11;
  if ($[10] !== agent.whenToUse) {
    t11 = <Box flexDirection="column">{t10}<Box marginLeft={2}><Text>{agent.whenToUse}</Text></Box></Box>;
    $[10] = agent.whenToUse;
    $[11] = t11;
  } else {
    t11 = $[11];
  }
  const T1 = Box;
  let t12;
  if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
    t12 = <Text><Text bold={true}>工具</Text>:{" "}</Text>;
    $[12] = t12;
  } else {
    t12 = $[12];
  }
  const t13 = render工具List();
  let t14;
  if ($[13] !== T1 || $[14] !== t12 || $[15] !== t13) {
    t14 = <T1>{t12}{t13}</T1>;
    $[13] = T1;
    $[14] = t12;
    $[15] = t13;
    $[16] = t14;
  } else {
    t14 = $[16];
  }
  let t15;
  if ($[17] === Symbol.for("react.memo_cache_sentinel")) {
    t15 = <Text bold={true}>模型</Text>;
    $[17] = t15;
  } else {
    t15 = $[17];
  }
  let t16;
  if ($[18] !== agent.model) {
    t16 = getAgent模型Display(agent.model);
    $[18] = agent.model;
    $[19] = t16;
  } else {
    t16 = $[19];
  }
  let t17;
  if ($[20] !== t16) {
    t17 = <Text>{t15}: {t16}</Text>;
    $[20] = t16;
    $[21] = t17;
  } else {
    t17 = $[21];
  }
  let t18;
  if ($[22] !== agent.permissionMode) {
    t18 = agent.permissionMode && <Text><Text bold={true}>权限模式</Text>: {agent.permissionMode}</Text>;
    $[22] = agent.permissionMode;
    $[23] = t18;
  } else {
    t18 = $[23];
  }
  let t19;
  if ($[24] !== agent.memory) {
    t19 = agent.memory && <Text><Text bold={true}>记忆</Text>: {get记忆ScopeDisplay(agent.memory)}</Text>;
    $[24] = agent.memory;
    $[25] = t19;
  } else {
    t19 = $[25];
  }
  let t20;
  if ($[26] !== agent.hooks) {
    t20 = agent.hooks && Object.keys(agent.hooks).length > 0 && <Text><Text bold={true}>钩子</Text>: {Object.keys(agent.hooks).join(", ")}</Text>;
    $[26] = agent.hooks;
    $[27] = t20;
  } else {
    t20 = $[27];
  }
  let t21;
  if ($[28] !== agent.skills) {
    t21 = agent.skills && agent.skills.length > 0 && <Text><Text bold={true}>技能</Text>:{" "}{agent.skills.length > 10 ? `${agent.skills.length} 项技能` : agent.skills.join(", ")}</Text>;
    $[28] = agent.skills;
    $[29] = t21;
  } else {
    t21 = $[29];
  }
  let t22;
  if ($[30] !== agent.agentType || $[31] !== background颜色) {
    t22 = background颜色 && <Box><Text><Text bold={true}>颜色</Text>:{" "}<Text background颜色={background颜色} color="inverseText">{" "}{agent.agentType}{" "}</Text></Text></Box>;
    $[30] = agent.agentType;
    $[31] = background颜色;
    $[32] = t22;
  } else {
    t22 = $[32];
  }
  let t23;
  if ($[33] !== agent) {
    t23 = !isBuiltInAgent(agent) && <><Box><Text><Text bold={true}>系统提示词</Text>:</Text></Box><Box marginLeft={2} marginRight={2}><Markdown>{agent.getSystemPrompt()}</Markdown></Box></>;
    $[33] = agent;
    $[34] = t23;
  } else {
    t23 = $[34];
  }
  let t24;
  if ($[35] !== T0 || $[36] !== handleKeyDown || $[37] !== t11 || $[38] !== t14 || $[39] !== t17 || $[40] !== t18 || $[41] !== t19 || $[42] !== t20 || $[43] !== t21 || $[44] !== t22 || $[45] !== t23 || $[46] !== t9) {
    t24 = <T0 flexDirection={t5} gap={t6} tabIndex={t7} autoFocus={t8} onKeyDown={handleKeyDown}>{t9}{t11}{t14}{t17}{t18}{t19}{t20}{t21}{t22}{t23}</T0>;
    $[35] = T0;
    $[36] = handleKeyDown;
    $[37] = t11;
    $[38] = t14;
    $[39] = t17;
    $[40] = t18;
    $[41] = t19;
    $[42] = t20;
    $[43] = t21;
    $[44] = t22;
    $[45] = t23;
    $[46] = t9;
    $[47] = t24;
  } else {
    t24 = $[47];
  }
  return t24;
}
